/** Isolated PDF process: no Anthropic SDK or paid-model execution. */
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../db";
import { takeoffDocumentPreparations } from "@shared/schema";
import { readObject, writePrivate, inspectBytes } from "./documents";
import { openPDF, pageText, pageVectors, renderPage } from "./pdf";
import { ObjectStorageService, objectStorageClient } from "../replit_integrations/object_storage/objectStorage";
import { installTakeoffProcessDiagnostics, takeoffDiagnostic } from "./diagnostics";
import type { PreparationManifest } from "@shared/estimating/preparation";
import { renderPDF, rendererPeakMiB } from "./poppler";

installTakeoffProcessDiagnostics();
process.once("disconnect", () => process.exit(1));
process.once("message", async (task: {key: string; render?: {page: number; zoom: number; region?: [number,number,number,number]; path: string}}) => {
  let doc: Awaited<ReturnType<typeof openPDF>> | undefined;
  const started = performance.now();
  try {
    const [row] = await db.select().from(takeoffDocumentPreparations).where(eq(takeoffDocumentPreparations.key, task.key));
    if (!row?.snapshotPath) throw new Error("Missing pinned snapshot");
    takeoffDiagnostic("pdf.download.begin", {key:task.key});
    const bytes = await readObject(row.snapshotPath);
    takeoffDiagnostic("pdf.download.end", {bytes:bytes.length});
    if (task.render) {
      doc = await openPDF(bytes);
      const viewport=(await doc.getPage(task.render.page)).getViewport({scale:1});
      const png = await renderPDF(bytes,task.render.page,viewport.width,viewport.height,task.render.zoom,task.render.region);
      const dir = new ObjectStorageService().getPrivateObjectDir().replace(/^\/|\/$/g,"").split("/");
      const bucket = dir.shift()!;
      await objectStorageClient.bucket(bucket).file([...dir,task.render.path.replace(/^\/objects\//,"")].join("/")).save(png,{resumable:false,metadata:{contentType:"image/png"}});
    } else {
      if (row.status === "ready") return;
      await db.update(takeoffDocumentPreparations).set({status:"processing",error:null,updatedAt:new Date()}).where(eq(takeoffDocumentPreparations.key,task.key));
      const manifest: PreparationManifest = row.manifest || {pageCount:0,pages:[],sha256:createHash("sha256").update(bytes).digest("hex"),peakRssMiB:0};
      if (/\.pdf$/i.test(row.name)) {
        doc = await openPDF(bytes);
        if (doc.numPages > 500) throw new Error("PDF exceeds 500 pages. Split the drawing set.");
        manifest.pageCount = doc.numPages;
        for(let number=1; number<=doc.numPages; number++) {
          if(manifest.pages.some(p=>p.page===number)) continue;
          const tick=performance.now();
          takeoffDiagnostic("pdf.page.begin",{page:number});
          const page=await doc.getPage(number), viewport=page.getViewport({scale:1});
          const text=await pageText(doc,number);
          takeoffDiagnostic("pdf.text.complete",{page:number,items:text.length});
          const vectors=await pageVectors(doc,number);
          takeoffDiagnostic("pdf.vectors.complete",{page:number,paths:vectors.length});
          const title=text.filter(t=>t.x>viewport.width*.65||t.y>viewport.height*.8).map(t=>t.text).join(" ");
          const all=text.map(t=>t.text).join(" ");
          const textPath=await writePrivate(Buffer.from(JSON.stringify(text)),"json","application/json");
          const vectorsPath=await writePrivate(Buffer.from(JSON.stringify(vectors)),"json","application/json");
          takeoffDiagnostic("pdf.thumbnail.begin",{page:number});
          const thumbnailPath=await writePrivate(await renderPDF(bytes,number,viewport.width,viewport.height,.3),"png","image/png");
          takeoffDiagnostic("pdf.thumbnail.complete",{page:number});
          manifest.pages.push({page:number,title:title.slice(-600),sheetNumber:title.match(/\b[A-Z]{1,4}[-.]?\d{1,4}(?:\.\d+)?\b/g)?.at(-1)||"",
            scaleText:[...new Set(all.match(/(?:\d+\/)?\d+(?:\.\d+)?\s*(?:"|IN)\s*=\s*\d+(?:\.\d+)?\s*(?:'|FT)/gi)||[])],
            vector:vectors.length>0,width:viewport.width,height:viewport.height,textPath,vectorsPath,thumbnailPath});
          text.length=0; vectors.length=0;
          page.cleanup(); await doc.cleanup();
          global.gc?.();
          manifest.peakRssMiB=process.resourceUsage().maxRSS/1024 + rendererPeakMiB;
          await db.update(takeoffDocumentPreparations).set({manifest,updatedAt:new Date()}).where(eq(takeoffDocumentPreparations.key,task.key));
          takeoffDiagnostic("pdf.page.end",{page:number,ms:Math.round(performance.now()-tick)});
        }
      } else {
        const pages=await inspectBytes(row.name,bytes);
        manifest.pageCount=pages.length;
        manifest.pages=pages.map(p=>({...p,textPath:"",vectorsPath:"",thumbnailPath:row.snapshotPath!}));
      }
      manifest.peakRssMiB=process.resourceUsage().maxRSS/1024 + rendererPeakMiB;
      await db.update(takeoffDocumentPreparations).set({status:"ready",manifest,error:null,updatedAt:new Date()}).where(eq(takeoffDocumentPreparations.key,task.key));
    }
    takeoffDiagnostic("pdf.complete",{key:task.key,ms:Math.round(performance.now()-started)});
  } catch(error) {
    const message=error instanceof Error?error.message:"PDF preparation failed";
    takeoffDiagnostic("pdf.failed",{message});
    if(!task.render) await db.update(takeoffDocumentPreparations).set({status:"failed",error:message,updatedAt:new Date()}).where(eq(takeoffDocumentPreparations.key,task.key));
    process.exitCode=1;
  } finally {
    await doc?.destroy();
    await pool.end();
    process.disconnect?.();
    process.exit(process.exitCode || 0);
  }
});
