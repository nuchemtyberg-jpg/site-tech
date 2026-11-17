import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { openPDF, pageText, pageVectors, measurePaths, renderPage, sheetIndex } from "../server/takeoff/pdf";
import { validateSubmission } from "../server/takeoff/tools";
import { aiSettingsSchema, usageCost, type TakeoffState } from "../shared/estimating/takeoff";
import { emptyJob, newCategory, newLine } from "../shared/estimating/model";

export async function knownDrawing() {
  const pdf=await PDFDocument.create(), page=pdf.addPage([612,792]);
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(`S-101 FOUNDATION PLAN 1"=30'`,{x:350,y:30,font,size:10});
  page.drawLine({start:{x:50,y:600},end:{x:122,y:600},thickness:2,color:rgb(1,0,0)});
  page.drawRectangle({x:200,y:400,width:144,height:72,borderWidth:1,borderColor:rgb(0,0,0),color:rgb(.9,.9,.9)});
  return Buffer.from(await pdf.save());
}
test("PDF vector tools measure known line and closed area, text positions, scale and render",async()=>{
  const doc=await openPDF(await knownDrawing());
  try {
    const paths=await pageVectors(doc,1);
    const lines=measurePaths(paths,30/72,{region:[49,191,123,193]});
    assert.ok(Math.abs(lines.total-30)<.000001,JSON.stringify(paths));
    const areas=measurePaths(paths,30/72,{},true);
    assert.ok(Math.abs(areas.total-1800)<.000001);
    assert.throws(()=>measurePaths(paths,undefined as any),/scale/);
    const text=await pageText(doc,1);
    assert.ok(text.some(t=>t.text.includes("S-101")&&t.x>=350&&t.y>700));
    assert.ok((await sheetIndex(doc))[0].vector);
    assert.ok((await renderPage(doc,1,.3)).length>100);
  }finally{await doc.destroy();}
});
test("submit requires valid Phase1 inputs, unchanged rates, refs and blank overrides",()=>{
  const job=emptyJob(),cat=newCategory(),line=newLine();
  line.desc="Known work";line.qty="2";line.ref="S-101; stated quantity: 2 EA";line.res.sub=[{id:"sub",desc:"Work",qty:"qty",unit:"EA",cost:"100"}];
  cat.items=[line];job.categories=[cat];
  const state={job:emptyJob()} as TakeoffState;
  assert.equal(validateSubmission(job,state).summary.sell,200);
  assert.throws(()=>validateSubmission({...job,total:200},state),/totals/);
  line.priceOverride="200";assert.throws(()=>validateSubmission(job,state),/manual price/);
  line.priceOverride="";line.ref="";assert.throws(()=>validateSubmission(job,state),/cite sheet/);
  line.ref="S-101 measured 2";line.qty="1/0";assert.throws(()=>validateSubmission(job,state),/formula/);
});
test("token costs distinguish uncached input, output, cache read and cache write",()=>{
  const settings=aiSettingsSchema.parse({});
  assert.equal(settings.maxCost,25);assert.equal(settings.maxSteps,150);
  assert.equal(usageCost({input:1e6,output:1e6,cacheRead:1e6,cacheWrite:1e6},settings.prices["claude-opus-5-5"]),29.2);
});
