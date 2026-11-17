import { z } from "zod";
import { loadImage, createCanvas } from "@napi-rs/canvas";
import { jobSchema, MARKUPS } from "@shared/estimating/model";
import { computeJob, makeResolver, summarize } from "@shared/estimating/engine";
import type { TakeoffState } from "@shared/estimating/takeoff";
import { readObject, readSpreadsheet } from "./documents";
import { openPDF, pageText, pageVectors, sheetIndex, renderPage, measurePaths, type Region } from "./pdf";
import { assertAppendOnlyRates, ensureRateSnapshot } from "./rate-snapshot";
import { cachedPage, cachedJSON, preparedDocument, isolatedRender } from "./preparation";
import type { VectorPath } from "./pdf";

const region=z.tuple([z.number().nonnegative(),z.number().nonnegative(),z.number().positive(),z.number().positive()])
  .refine(r=>r[2]>r[0]&&r[3]>r[1],"Region must be [left,top,right,bottom] in page points.");
const pageArgs=z.object({document:z.number().int().positive(),page:z.number().int().positive(),region:region.optional()});
const filters=pageArgs.extend({layer:z.string().optional(),color:z.string().optional(),weight:z.number().nonnegative().optional(),
  offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(500).default(100)});
const str={type:"string"},num={type:"number"};
const regionJSON={type:"array",items:num,minItems:4,maxItems:4,description:"[left,top,right,bottom], top-left page points (72 points/inch)"};
const pageProperties={document:{type:"integer",description:"Selected file ID"},page:{type:"integer",minimum:1},region:regionJSON};
const tool=(name:string,description:string,properties:Record<string,unknown>,required:string[]=[])=>({
  name,description,input_schema:{type:"object" as const,properties,required,additionalProperties:false},
});
export const TAKEOFF_TOOLS=[
  tool("sheet_index","Index selected PDF pages with title-block text, sheet label candidates, scale text and vector/scan status. Verify ambiguous title/scale candidates visually.",{document:num},["document"]),
  tool("page_text","Read PDF text and positions. Use a region to isolate schedules, title blocks and notes.",pageProperties,["document","page"]),
  tool("view_page","Render selected page or zoomed region. Image-derived quantities on scans MUST be flagged ASSUMED/VERIFY and approximate.",{...pageProperties,zoom:{type:"number",minimum:.1,maximum:4}},["document","page"]),
  tool("layers","List PDF optional-content layer names and vector-path counts (empty when unlayered).",pageProperties,["document","page"]),
  tool("measure_lines","Measure vector polylines in feet; requires set_scale/calibrate. Region includes wholly contained paths only. Returns all-match total and paginated individual geometry; unrelated drafting paths must be filtered.",{...pageProperties,layer:str,color:str,weight:num,offset:num,limit:num},["document","page"]),
  tool("measure_areas","Measure individual closed vector boundaries in SF. NOT a polygon union: inspect holes, overlapping shapes and hatches, never sum blindly. Requires calibrated scale.",{...pageProperties,layer:str,color:str,weight:num,offset:num,limit:num},["document","page"]),
  tool("find_text","Find literal text or a simple glob pattern (* and ?, at most two stars), case-insensitive, with page positions. Supply text or pattern; regular expressions are not supported.",{document:num,text:str,pattern:str,pages:{type:"array",items:num}},["document"]),
  tool("set_scale","Set a verified scale in feet per PDF point. For 1 inch = 30 feet use feetPerPoint=30/72. Record cited scale source. Never assume scale from image dimensions.",{...pageProperties,feetPerPoint:num,source:str},["document","page","feetPerPoint","source"]),
  tool("calibrate","Set scale from two page-point coordinates and a known real-world distance in feet, citing its source.",{...pageProperties,points:{type:"array",items:{type:"array",items:num,minItems:2,maxItems:2},minItems:2,maxItems:2},knownFeet:num,source:str},["document","page","points","knownFeet","source"]),
  tool("read_spreadsheet","Read uploaded XLSX/CSV rows; formulas include cached values, never execute spreadsheet code.",{document:num},["document"]),
  tool("evaluate","Use the exact SiteTech formula evaluator with named rates, feet-inches and optional line qty.",{formula:str,qty:num},["formula"]),
  tool("checkpoint_takeoff","Persist partial estimate work after each category so it survives a cap or restart. Same job shape as submit_takeoff; unfinished lines must be flagged NOT QUANTIFIED. Existing rates are immutable; only append new unique named material rates with id,key,desc,unit,value and optional category/notes.",{job:{type:"object"}},["job"]),
  tool("submit_takeoff","Submit full Phase1 job with NO totals. Supply summary and questions separately. SiteTech validates and calculates totals, creates new revision only. All line/category markups blank, priceOverride blank; every line cites sheet + method + arithmetic. Preserve existing material rates, IDs, labor/equipment tables and defaults. May append unique named material rates with description, unit and valid value/formula; never rewrite previous additions.",{job:{type:"object"},summary:str,questions:{type:"array",items:str}},["job","summary","questions"]),
];
export function validateSubmission(raw: unknown,state:TakeoffState) {
  if(raw && typeof raw==="object" && ["total","totals","summary","sell","cost"].some(k=>k in raw))
    throw new Error("Do not submit totals. SiteTech calculates them.");
  const job=jobSchema.parse(raw);
  assertAppendOnlyRates(job,state);
  if(!job.categories.length) throw new Error("Takeoff needs at least one category; explain missing/unknown quantities with flagged lines.");
  for(const cat of job.categories) {
    if(MARKUPS.some(k=>cat[k].trim())) throw new Error(`Category ${cat.name}: leave markups blank.`);
    for(const line of cat.items) {
      if(MARKUPS.some(k=>line[k].trim())||line.priceOverride.trim()) throw new Error(`Line ${line.desc}: markups and manual price must be blank.`);
      if(!line.ref.trim()) throw new Error(`Line ${line.desc}: cite sheet, method and arithmetic in ref.`);
      for(const row of line.res.lab) if(row.ltype&&!job.laborRates.some(t=>t.id===row.ltype)) throw new Error(`Unknown labor type ${row.ltype}.`);
      for(const row of line.res.eq) if(row.etype&&!job.equipRates.some(t=>t.id===row.etype)) throw new Error(`Unknown equipment type ${row.etype}.`);
    }
  }
  const computed=computeJob(job);
  if(Object.keys(computed.errs).length) throw new Error(`Correct formula errors: ${JSON.stringify(computed.errs)}`);
  if(Object.values(computed.total).some(n=>!Number.isFinite(n))||Math.abs(Math.round(computed.total.sell))>2147483647)
    throw new Error("Calculated totals must be finite and within Opportunity value range.");
  return {job,computed,summary:summarize(job,computed)};
}
export async function executeTool(name:string,raw:unknown,state:TakeoffState):Promise<{result:unknown;image?:string;submitted?:{summary:string;questions:string[]}}> {
  if(name==="evaluate") {
    const a=z.object({formula:z.string().max(500),qty:z.number().finite().optional()}).parse(raw);
    return {result:makeResolver(state.job).ev(a.formula,a.qty===undefined?undefined:{qty:a.qty})};
  }
  if(name==="submit_takeoff"||name==="checkpoint_takeoff") {
    const a=z.object({job:z.unknown(),summary:z.string().max(12000).default(""),questions:z.array(z.string().max(2000)).max(200).default([])}).parse(raw);
    ensureRateSnapshot(state);
    const valid=validateSubmission(a.job,state); state.job=valid.job;
    return {result:{accepted:true,totals:valid.summary},...(name==="submit_takeoff"?{submitted:{summary:a.summary,questions:a.questions}}:{})};
  }
  const documentId=z.object({document:z.number().int().positive()}).parse(raw).document;
  const file=state.documents.find(d=>d.fileId===documentId);
  if(!file) throw new Error("This document was not selected for the run.");
  if(name==="read_spreadsheet") {
    if(!/\.(xlsx|csv)$/i.test(file.name)) throw new Error("Select an XLSX or CSV document.");
    return {result:await readSpreadsheet(file.name,await readObject(file.snapshotPath))};
  }
  if(!/\.pdf$/i.test(file.name)) {
    const bytes=await readObject(file.snapshotPath);
    if(name==="sheet_index") {
      const result=[{page:1,title:file.name,sheetNumber:"",scaleText:[],vector:false,warning:"Raster/spreadsheet; read visually or use read_spreadsheet."}];
      (state.sheetIndexes??={})[String(documentId)]=result;
      return {result};
    }
    if(name!=="view_page") throw new Error("This is not a vector PDF. Use view_page and flag image-based measurements as approximate.");
    const a=pageArgs.extend({zoom:z.number().min(.1).max(4).default(1)}).parse(raw);
    if(!file.pages.includes(a.page)) throw new Error("Page not selected.");
    const image=await loadImage(bytes),box=a.region||[0,0,image.width,image.height],w=box[2]-box[0],h=box[3]-box[1],s=Math.min(a.zoom,2000/Math.max(w,h));
    const canvas=createCanvas(Math.ceil(w*s),Math.ceil(h*s));canvas.getContext("2d").drawImage(image,box[0],box[1],w,h,0,0,canvas.width,canvas.height);
    return {result:{approximate:true,warning:"Raster image: no vector measurement data."},image:canvas.toBuffer("image/png").toString("base64")};
  }
  const prepared=await preparedDocument(file);
  const readText=async(page:number)=>cachedJSON<Awaited<ReturnType<typeof pageText>>>((await cachedPage(file,page)).textPath);
  {
    if(name==="sheet_index") {
      const result=prepared.manifest.pages.filter(p=>file.pages.includes(p.page)).map(({textPath,vectorsPath,thumbnailPath,...p})=>p);
      (state.sheetIndexes??={})[String(documentId)]=result;
      return {result};
    }
    if(name==="find_text") {
      const a=z.object({text:z.string().min(1).max(500).optional(),pattern:z.string().min(1).max(100).optional(),pages:z.array(z.number().int().positive()).optional()}).refine(v=>!!v.text!==!!v.pattern,"Supply text or pattern").parse(raw);
      if(a.pattern&&(a.pattern.match(/\*/g)||[]).length>2) throw new Error("Use at most two wildcard stars.");
      const pattern=a.pattern?new RegExp(a.pattern.split("").map(c=>c==="*"?"[^\\n]{0,200}":c==="?"?".":c.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join(""),"gi"):null;
      const result=[];
      for(const page of a.pages||file.pages) {
        if(!file.pages.includes(page)) throw new Error("Page not selected.");
        for(const item of await readText(page)) {
          if(pattern) {
            for(const match of item.text.slice(0,2000).matchAll(pattern)) if(match[0].length) result.push({page,...item,characterOffset:match.index});
            continue;
          }
          let offset=0,index=-1;
          while((index=item.text.toLowerCase().indexOf(a.text!.toLowerCase(),offset))!==-1) {
            result.push({page,...item,characterOffset:index});offset=index+a.text!.length;
          }
        }
      }
      return {result};
    }
    const a=pageArgs.parse(raw);
    if(!file.pages.includes(a.page)) throw new Error("Page not selected.");
    const key=`${documentId}:${a.page}`;
    if(name==="page_text") return {result:(await readText(a.page)).filter(t=>!a.region||(t.x>=a.region[0]&&t.y>=a.region[1]&&t.x<=a.region[2]&&t.y<=a.region[3]))};
    if(name==="view_page") return {result:{page:a.page},image:(await isolatedRender(file,a.page,z.object({zoom:z.number().min(.1).max(4).default(1)}).parse(raw).zoom,a.region)).toString("base64")};
    if(name==="set_scale"||name==="calibrate") {
      const source=z.object({source:z.string().trim().min(1).max(2000)}).parse(raw).source;
      let feetPerPoint:number;
      if(name==="set_scale") feetPerPoint=z.object({feetPerPoint:z.number().positive().finite()}).parse(raw).feetPerPoint;
      else {
        const v=z.object({points:z.tuple([z.tuple([z.number(),z.number()]),z.tuple([z.number(),z.number()])]),knownFeet:z.number().positive()}).parse(raw);
        feetPerPoint=v.knownFeet/Math.hypot(v.points[1][0]-v.points[0][0],v.points[1][1]-v.points[0][1]);
      }
      if(!Number.isFinite(feetPerPoint)||feetPerPoint<=0) throw new Error("Calibration points must be distinct.");
      state.scales[key]={feetPerPoint,method:`${name}: ${source}`};
      return {result:state.scales[key]};
    }
    const paths=await cachedJSON<VectorPath[]>((await cachedPage(file,a.page)).vectorsPath);
    if(name==="layers") {
      const counts:Record<string,number>={};
      for(const p of paths) if(p.layer) counts[p.layer]=(counts[p.layer]||0)+1;
      return {result:Object.entries(counts).map(([name,count])=>({name,count}))};
    }
    if(name==="measure_lines"||name==="measure_areas") {
      const f=filters.parse(raw);
      if(!paths.length) throw new Error("No vector paths: scanned page. Use view_page and explicitly flag approximate quantities.");
      const measurement=measurePaths(paths,state.scales[key]?.feetPerPoint,f,name==="measure_areas");
      return {result:{...measurement,count:measurement.paths.length,paths:measurement.paths.slice(f.offset,f.offset+f.limit),offset:f.offset,scale:state.scales[key]}};
    }
    throw new Error(`Unknown tool: ${name}`);
  }
}
