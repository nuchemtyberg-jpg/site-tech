import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull, or } from "drizzle-orm";
import ExcelJS from "exceljs";
import { loadImage, createCanvas } from "@napi-rs/canvas";
import { db } from "../db";
import { files, opportunities } from "@shared/schema";
import { ObjectStorageService, objectStorageClient } from "../replit_integrations/object_storage/objectStorage";
import { EstimateError } from "../services/estimating";
import { openPDF, renderPage, sheetIndex } from "./pdf";
import type { RunDocument } from "@shared/estimating/takeoff";

const storage = new ObjectStorageService();
const MAX_BYTES = 40 * 1024 * 1024;
export async function opportunityDocuments(id: number) {
  const [opp] = await db.select().from(opportunities).where(and(eq(opportunities.id,id),isNull(opportunities.deletedAt)));
  if(!opp) throw new EstimateError(404,"Opportunity not found");
  const projectIds = [...new Set([opp.targetProjectId,opp.convertedProjectId,opp.migratedFromProjectId].filter((v):v is number=>!!v))];
  const rows=await db.select().from(files).where(and(isNull(files.deletedAt),or(
    and(eq(files.relatedEntityType,"opportunity"),eq(files.relatedEntityId,id)),
    ...projectIds.map(projectId=>eq(files.projectId,projectId)),
  )));
  return rows.filter(f=>/\.(pdf|png|jpg|jpeg|webp|xlsx|csv)$/i.test(f.name)).map(f=>({...f,source:f.relatedEntityType==="opportunity"&&f.relatedEntityId===id?"Opportunity":"Linked project"}));
}
export async function permittedFile(opportunityId: number, fileId: number) {
  const file=(await opportunityDocuments(opportunityId)).find(f=>f.id===fileId);
  if(!file) throw new EstimateError(404,"Document is not available on this Opportunity or its linked project.");
  return file;
}
export async function readObject(path: string) {
  const file=await storage.getObjectEntityFile(path);
  const [metadata]=await file.getMetadata();
  if(Number(metadata.size)>MAX_BYTES) throw new EstimateError(413,"Document exceeds 40 MB. Split it before starting a takeoff.");
  const [bytes]=await file.download();
  if(bytes.length>MAX_BYTES) throw new EstimateError(413,"Document exceeds 40 MB.");
  return bytes;
}
export async function writePrivate(bytes: Buffer, suffix: string, contentType: string) {
  const directory=storage.getPrivateObjectDir().replace(/^\/|\/$/g,"");
  const [bucket,...prefix]=directory.split("/");
  const key=`takeoff/${randomUUID()}.${suffix}`;
  await objectStorageClient.bucket(bucket).file([...prefix,key].join("/")).save(bytes,{resumable:false,metadata:{contentType}});
  return `/objects/${key}`;
}
export async function snapshotDocument(opportunityId: number, fileId: number, pages: number[]): Promise<RunDocument> {
  const file=await permittedFile(opportunityId,fileId);
  const bytes=await readObject(file.objectPath);
  const index=await inspectBytes(file.name,bytes);
  const selected=[...new Set(pages)].sort((a,b)=>a-b);
  if(selected.some(page=>!index.some(p=>p.page===page))) throw new EstimateError(400,"A selected document page does not exist.");
  const suffix=file.name.split(".").pop()!.toLowerCase();
  const snapshotPath=await writePrivate(bytes,suffix,file.contentType||"application/octet-stream");
  return {fileId,name:file.name,contentType:file.contentType||"application/octet-stream",objectPath:file.objectPath,
    snapshotPath,sha256:createHash("sha256").update(bytes).digest("hex"),pages:selected};
}
export async function inspectBytes(name: string, bytes: Buffer) {
  if(/\.pdf$/i.test(name)) {
    const doc=await openPDF(bytes);
    try{return await sheetIndex(doc);}finally{await doc.destroy();}
  }
  if(/\.(xlsx|csv)$/i.test(name)) return [{page:1,title:name,sheetNumber:"",scaleText:[],vector:false,width:0,height:0}];
  const image=await loadImage(bytes);
  return [{page:1,title:name,sheetNumber:"",scaleText:[],vector:false,width:image.width,height:image.height}];
}
export async function documentThumbnail(opportunityId: number, fileId: number, page: number) {
  const file=await permittedFile(opportunityId,fileId), bytes=await readObject(file.objectPath);
  if(/\.pdf$/i.test(file.name)) {
    const doc=await openPDF(bytes);
    try{return await renderPage(doc,page,.3);}finally{await doc.destroy();}
  }
  if(/\.(xlsx|csv)$/i.test(file.name)) throw new EstimateError(400,"Spreadsheet has no page thumbnail.");
  const image=await loadImage(bytes), width=Math.min(500,image.width), height=Math.max(1,Math.round(image.height*width/image.width));
  const canvas=createCanvas(width,height);canvas.getContext("2d").drawImage(image,0,0,width,height);
  return canvas.toBuffer("image/png");
}
export async function readSpreadsheet(name: string, bytes: Buffer) {
  const workbook=new ExcelJS.Workbook();
  if(/\.csv$/i.test(name)) {
    const { Readable }=await import("node:stream");
    await workbook.csv.read(Readable.from(bytes));
  } else await workbook.xlsx.load(bytes as any);
  let count=0;
  return workbook.worksheets.map(sheet=>{
    const rows: unknown[][]=[];
    sheet.eachRow(row=>{
      if(++count>20000) throw new Error("Spreadsheet exceeds 20,000 rows; split it before use.");
      rows.push((row.values as unknown[]).slice(1).map(value=>{
        if(value&&typeof value==="object"&&"formula" in value) return {formula:(value as any).formula,cachedResult:(value as any).result??null};
        return value;
      }));
    });
    return {name:sheet.name,rows};
  });
}
