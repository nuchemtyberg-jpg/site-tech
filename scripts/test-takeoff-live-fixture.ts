/** Explicitly authorized live test. Synthetic 3-page PDF, Sonnet, $1 total cap.
 * Never touches/retries a real run. Retains the fixture run for inspection. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {PDFDocument} from "pdf-lib";
import {eq} from "drizzle-orm";
import {db,pool} from "../server/db";
import {customers,opportunities,takeoffRuns} from "../shared/schema";
import {emptyJob} from "../shared/estimating/model";
import {aiSettingsSchema,type TakeoffState} from "../shared/estimating/takeoff";
import {writePrivate} from "../server/takeoff/documents";
import {pinSource,preparationTick,getPreparation} from "../server/takeoff/preparation";
import {executeClaimedRun} from "../server/takeoff/worker";
const tag=`__live-context-fixture-${randomUUID()}`;
async function main(){
  const pdf=await PDFDocument.create();
  for(let n=1;n<=3;n++){
    const p=pdf.addPage([612,792]);
    p.drawText(`C-00${n} SYNTHETIC CACHE TEST`,{x:40,y:750,size:14});
    p.drawText(`Scope: one precast pad on this sheet. Quantity 1 EA. Material rate key pad.`,{x:30,y:700,size:10});
    p.drawText("No other work. No labor/equipment/tax/markups. Total across all sheets: 3 EA.",{x:30,y:680,size:10});
    for(let j=0;j<25;j++)p.drawText(`Reference ${j}: test notes only; count the one pad, not these repeated notes.`,{x:30,y:650-j*15,size:9});
  }
  const path=await writePrivate(Buffer.from(await pdf.save()),"pdf","application/pdf");
  const pinned=await pinSource(999001,"Synthetic-three-page-context.pdf",path);
  for(let i=0;i<120;i++){await preparationTick();const prep=await getPreparation(pinned.key);if(prep.status==="ready")break;if(prep.status==="failed")throw Error(prep.error||"Preparation failed");await new Promise(r=>setTimeout(r,500));}
  assert.equal((await getPreparation(pinned.key)).status,"ready");
  const [customer]=await db.insert(customers).values({name:tag}).returning();
  const [opp]=await db.insert(opportunities).values({name:tag,opportunityNumber:tag,customerId:customer.id}).returning();
  const job=emptyJob();job.rates=[{id:"pad",key:"pad",desc:"Fixture precast pad",unit:"EA",value:"10",category:"Test",notes:"Synthetic test price"}];
  const state:TakeoffState={
    job,documents:[{fileId:999001,name:"Synthetic-three-page-context.pdf",contentType:"application/pdf",pages:[1,2,3],sha256:"",objectPath:path,snapshotPath:path,preparationKey:pinned.key}],
    preparationComplete:false,settings:aiSettingsSchema.parse({model:"claude-sonnet-5-5",maxCost:1,maxSteps:12}),playbook:{id:null,version:0,markdown:""},rules:[],trades:["Site work"],
    instructions:"Synthetic integration test. Read sheet_index, then page_text on pages 1, 2, 3 in separate consecutive turns (not parallel), so each result can be verified. Use stated quantities only. Each sheet has one pad: total 3 EA. Use material rate key pad (10). No labor, equipment or markups. After reading all three pages call checkpoint_category for ONE category with one line qty 3, unit EA, material row qty 'qty', cost 'pad'; cite C-001, C-002, C-003 stated quantities 1+1+1=3. Then submit_takeoff with use_checkpoint:true, concise summary and empty questions. Do not output full job or rates. No rendering needed because the sheet text explicitly states quantities.",
    messages:[],scales:{},sheetIndexes:{},cost:0,steps:0,budget:1,stepLimit:12,usage:{input:0,output:0,cacheRead:0,cacheWrite:0},progress:[],
    contextManagement:{edits:[
      {type:"clear_thinking_20251015",keep:"all"},
      {type:"clear_tool_uses_20250919",trigger:{type:"tool_uses",value:3},keep:{type:"tool_uses",value:1},clear_at_least:{type:"input_tokens",value:1},exclude_tools:["checkpoint_category","submit_takeoff"]},
    ]},
  };
  const [run]=await db.insert(takeoffRuns).values({opportunityId:opp.id,createdBy:tag,status:"running",state,leaseOwner:tag,leaseUntil:new Date(Date.now()+3600000),startedAt:new Date()}).returning();
  console.log(JSON.stringify({fixtureRun:run.id,opportunity:opp.id,model:state.settings.model,cap:1}));
  try{
    await executeClaimedRun(run,{leaseOwner:tag,client:new (await import("@anthropic-ai/sdk")).default({maxRetries:0})});
    const [done]=await db.select().from(takeoffRuns).where(eq(takeoffRuns.id,run.id));
    console.log(JSON.stringify({fixtureRun:run.id,status:done.status,cost:done.state.cost,error:done.error,steps:done.state.steps,costEvents:done.state.costEvents,contextEdits:done.state.contextEdits,toolTimings:done.state.toolTimings}));
    assert.ok(done.state.cost<=1,"Must honor $1 cap");
    assert.equal(done.status,"needs_review");
    assert.ok(done.state.contextEdits?.some(e=>e.appliedEdits?.some((a:any)=>a.cleared_tool_uses>0)),"Server must actually clear tool results");
    assert.ok(done.state.costEvents?.some(e=>(e.usage?.cacheRead||0)>0),"Must observe cache reads");
  }finally{
    await db.update(takeoffRuns).set({status:"failed",error:"Fixture process ended before completion; do not auto-resume",leaseOwner:null,leaseUntil:null}).where((await import("drizzle-orm")).and(eq(takeoffRuns.id,run.id),eq(takeoffRuns.status,"running")));
  }
}
main().catch(e=>{console.error(e instanceof Error?e.message:"Fixture failed");process.exitCode=1}).finally(()=>pool.end());
