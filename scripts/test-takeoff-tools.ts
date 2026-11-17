import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { openPDF, pageText, pageVectors, measurePaths, renderPage, sheetIndex } from "../server/takeoff/pdf";
import { executeTool, validateSubmission } from "../server/takeoff/tools";
import { addedMaterialRates, ensureRateSnapshot } from "../server/takeoff/rate-snapshot";
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

function rateFixture() {
  const job=emptyJob(), cat=newCategory(), line=newLine();
  job.rates=[{id:"base",key:"base",desc:"Existing",unit:"TON",value:"20",category:"Stone",notes:"quoted"}];
  job.laborRates=[{id:"operator",name:"Operator",hr:"10",day:"80"}];
  job.equipRates=[{id:"excavator",name:"Excavator",hr:"10",day:"80",wk:"400",mo:"1600"}];
  job.markupNotes={tax:"tax note",oh:"",ins:"",profit:""};
  line.desc="Measured work";line.qty="2";line.ref="C1; measured 2 EA";cat.items=[line];job.categories=[cat];
  const state={job:structuredClone(job)} as TakeoffState;ensureRateSnapshot(state);
  return {job,state};
}
test("checkpoint and submit allow valid new rate formulas and keep original baseline/provenance",async()=>{
  const {job,state}=rateFixture();
  job.rates.push({id:"new",key:"dga",desc:"Aggregate",unit:"CY",value:"base*1.9",category:"Stone",notes:"VERIFY quote"});
  await executeTool("checkpoint_takeoff",{job},state);
  assert.equal(state.originalRates!.rates.length,1);assert.equal(state.job.rates.length,2);
  const persisted=JSON.parse(JSON.stringify(state)) as TakeoffState;
  const added=addedMaterialRates(persisted);
  assert.equal(added[0].key,"dga");assert.equal(added[0].computedValue,38);
  const submitted=await executeTool("submit_takeoff",{job:persisted.job,summary:"Done",questions:[]},persisted);
  assert.ok(submitted.submitted);
  assert.deepEqual(addedMaterialRates(persisted),added);
});
test("existing rate fields, metadata, IDs, tables and defaults cannot change or disappear",()=>{
  for(const mutation of [
    (j:any)=>j.rates[0].value="21", (j:any)=>j.rates[0].key="renamed", (j:any)=>j.rates[0].id="newId",
    (j:any)=>j.rates[0].notes="changed", (j:any)=>j.rates=[],
    (j:any)=>j.laborRates[0].hr="11", (j:any)=>j.equipRates[0].day="99",
    (j:any)=>j.defaults.profit="10", (j:any)=>j.markupNotes.tax="changed",
  ]) {
    const {job,state}=rateFixture();mutation(job);
    assert.throws(()=>validateSubmission(job,state),/unchanged/);
  }
});
test("previously accepted Claude additions are also immutable across checkpoints and continuation",async()=>{
  const {job,state}=rateFixture();
  job.rates.push({id:"new",key:"new",desc:"New",unit:"EA",value:"0"});
  await executeTool("checkpoint_takeoff",{job},state);
  const changed=structuredClone(job);changed.rates[1].value="100";
  assert.throws(()=>validateSubmission(changed,state),/unchanged/);
  const removed=structuredClone(job);removed.rates.pop();
  assert.throws(()=>validateSubmission(removed,state),/unchanged/);
  assert.equal(addedMaterialRates(state)[0].computedValue,0);
});
test("new rates require unique valid keys and IDs, metadata, finite noncyclic formulas and real references",()=>{
  for(const row of [
    {id:"b",key:"BASE",desc:"dup",unit:"EA",value:"1"},
    {id:"base",key:"different",desc:"ID collision",unit:"EA",value:"1"},
    {id:"b",key:"qty",desc:"reserved",unit:"EA",value:"1"},
    {id:"b",key:"x-y",desc:"bad key",unit:"EA",value:"1"},
    {id:"b",key:"good",desc:"",unit:"EA",value:"1"},
    {id:"b",key:"good",desc:"Name",unit:"",value:"1"},
    {id:"b",key:"good",desc:"Name",unit:"EA",value:""},
    {id:"b",key:"good",desc:"Name",unit:"EA",value:"missing*2"},
    {id:"b",key:"good",desc:"Name",unit:"EA",value:"good*2"},
    {id:"b",key:"good",desc:"Name",unit:"EA",value:"10^999"},
  ]) {
    const {job,state}=rateFixture();job.rates.push(row);
    assert.throws(()=>validateSubmission(job,state));
  }
  const {job,state}=rateFixture();
  job.rates.push({id:"x",key:"x",desc:"X",unit:"EA",value:"y"},{id:"y",key:"y",desc:"Y",unit:"EA",value:"x"});
  assert.throws(()=>validateSubmission(job,state),/formula/);
});
test("legacy finished jobs have no invented added-rate provenance; failed submissions do not change the checkpoint",async()=>{
  const {job,state}=rateFixture();
  delete state.originalRates;assert.deepEqual(addedMaterialRates(state),[]);
  const before=structuredClone(state.job);
  job.rates.push({id:"b",key:"new",desc:"Name",unit:"EA",value:"missing"});
  await assert.rejects(executeTool("checkpoint_takeoff",{job},state),/formula/);
  assert.deepEqual(state.job,before);assert.equal(state.originalRates!.rates.length,1);
});
