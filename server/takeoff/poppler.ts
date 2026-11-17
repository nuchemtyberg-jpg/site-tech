import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { takeoffDiagnostic } from "./diagnostics";
export let rendererPeakMiB = 0;
/** Separate native renderer: avoids the canvas crash reproduced on the signed set. */
export async function renderPDF(bytes: Buffer, page: number, width: number, height: number, zoom=.3, region?: number[]) {
  const directory=await mkdtemp(join(tmpdir(),"takeoff-render-"));
  try {
    const source=join(directory,"source.pdf"); await writeFile(source,bytes);
    const box=region||[0,0,width,height];
    const scale=Math.min(Math.max(zoom,.1),4,2200/Math.max(box[2]-box[0],box[3]-box[1]));
    return await new Promise<Buffer>((resolve,reject)=>{
      const child=execFile("pdftoppm",["-f",String(page),"-l",String(page),"-singlefile","-png","-r",String(72*scale),
        "-x",String(Math.floor(box[0]*scale)),"-y",String(Math.floor(box[1]*scale)),
        "-W",String(Math.max(1,Math.ceil((box[2]-box[0])*scale))),"-H",String(Math.max(1,Math.ceil((box[3]-box[1])*scale))),source],
      {encoding:"buffer",maxBuffer:20*1024*1024,timeout:120000},(error,stdout)=>{
        clearInterval(timer);
        takeoffDiagnostic("pdf.renderer.exit",{page,rendererPeakMiB});
        error?reject(new Error(`PDF renderer failed on page ${page}: ${error.message}`)):resolve(stdout);
      });
      const timer=setInterval(()=>{
        if(child.pid) void readFile(`/proc/${child.pid}/status`,"utf8").then(s=>{
          const kib=Number(s.match(/VmRSS:\s+(\d+)/)?.[1]||0);
          rendererPeakMiB=Math.max(rendererPeakMiB,kib/1024);
        }).catch(()=>{});
      },50);
    });
  } finally { await rm(directory,{recursive:true,force:true}); }
}
