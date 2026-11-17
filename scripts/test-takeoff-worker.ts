import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../server/db";
import { customers, opportunities, takeoffRuns, estimateRevisions, notifications } from "../shared/schema";
import { emptyJob, newCategory, newLine } from "../shared/estimating/model";
import { aiSettingsSchema, type TakeoffState } from "../shared/estimating/takeoff";
import { executeClaimedRun, SYSTEM } from "../server/takeoff/worker";
import { publicRun } from "../server/takeoff/service";
import { executeTool } from "../server/takeoff/tools";
import { PDFDocument } from "pdf-lib";
import { writePrivate } from "../server/takeoff/documents";
import { ObjectStorageService } from "../server/replit_integrations/object_storage/objectStorage";
const tag=`__takeoff-test-${randomUUID()}`, owner=tag;
async function main() {
  let cid:number|undefined, oid:number|undefined;
  let testObject:string|undefined;
  const state=():TakeoffState=>({documents:[],instructions:"",trades:[],settings:aiSettingsSchema.parse({}),playbook:{id:null,version:0,markdown:""},
    rules:[],job:emptyJob(),messages:[],scales:{},usage:{input:0,output:0,cacheRead:0,cacheWrite:0},cost:0,steps:0,budget:25,stepLimit:150,progress:[]});
  try {
    const [c]=await db.insert(customers).values({name:tag}).returning();cid=c.id;
    const [o]=await db.insert(opportunities).values({name:tag,opportunityNumber:tag,customerId:cid}).returning();oid=o.id;
    const makeRun=async(s:TakeoffState,cancel=false)=>(await db.insert(takeoffRuns).values({opportunityId:oid!,createdBy:tag,status:"running",state:s,
      leaseOwner:owner,leaseUntil:new Date(Date.now()+600000),cancelRequested:cancel}).returning())[0];
    const job=emptyJob(),cat=newCategory(),line=newLine();
    line.desc="Known item";line.qty="2";line.ref="S1; count 2";line.res.sub=[{id:"sub",desc:"Known cost",qty:"qty",unit:"EA",cost:"100"}];cat.items=[line];job.categories=[cat];
    let calls=0;
    const client:any={messages:{countTokens:async()=>({input_tokens:100}),create:async()=>{calls++;return {usage:{input_tokens:100,output_tokens:500,cache_read_input_tokens:0,cache_creation_input_tokens:0},
      content:[{type:"tool_use",id:"submit-1",name:"submit_takeoff",input:{job,summary:"Known measured item.",questions:["Confirm plan revision?"]}}]};}}};
    const run=await makeRun(state());await executeClaimedRun(run,{client,leaseOwner:owner});
    const [done]=await db.select().from(takeoffRuns).where(eq(takeoffRuns.id,run.id));
    assert.equal(done.status,"needs_review");assert.ok(done.revisionId);assert.equal(calls,1);
    const [rev]=await db.select().from(estimateRevisions).where(eq(estimateRevisions.id,done.revisionId!));assert.equal(rev.summary.sell,200);
    // Recovery replays persisted tools, not the paid model request.
    const recovery=state();recovery.messages=[{role:"assistant",content:[{type:"tool_use",id:"recovered",name:"submit_takeoff",input:{job,summary:"Recovered",questions:[]}}]}];
    const resumed=await makeRun(recovery);await executeClaimedRun(resumed,{client,leaseOwner:owner});assert.equal(calls,1);
    const capped=state();capped.steps=150;capped.job=job;
    const cap=await makeRun(capped);await executeClaimedRun(cap,{client,leaseOwner:owner});
    const [stopped]=await db.select().from(takeoffRuns).where(eq(takeoffRuns.id,cap.id));assert.equal(stopped.status,"stopped_at_cap");
    assert.ok(stopped.state.job.categories.some(c=>c.items.some(l=>l.flag.includes("NOT QUANTIFIED"))));
    const cancel=await makeRun(state(),true);await executeClaimedRun(cancel,{client,leaseOwner:owner});
    assert.equal((await db.select().from(takeoffRuns).where(eq(takeoffRuns.id,cancel.id)))[0].status,"cancelled");
    assert.equal(calls,1);
    assert.match(SYSTEM,/NJ\/NY subcontractor; follow the playbook for the trade/);
    assert.match(SYSTEM,/geotech and trade-specific notes/);
    assert.doesNotMatch(SYSTEM,/geotech\/SOE/);

    // Real synthetic sheet tools retain canonical state independently of messages.
    const pdf=await PDFDocument.create();pdf.addPage().drawText("C-101 SITE PLAN");
    testObject=await writePrivate(Buffer.from(await pdf.save()),"pdf","application/pdf");
    const indexed=state();indexed.documents=[{fileId:999,name:"Synthetic.pdf",contentType:"application/pdf",pages:[1],sha256:"test",objectPath:testObject,snapshotPath:testObject}];
    const indexResult=await executeTool("sheet_index",{document:999},indexed);
    assert.deepEqual(indexed.sheetIndexes?.["999"],indexResult.result);
    await executeTool("set_scale",{document:999,page:1,feetPerPoint:30/72,source:"Synthetic plan stated scale"},indexed);
    assert.equal(indexed.scales["999:1"].feetPerPoint,30/72);
    const priced=structuredClone(job);
    priced.rates.push({id:"added",key:"added",desc:"Claude named rate",unit:"EA",value:"50",category:"Test",notes:"VERIFY"});
    let pricedCalls=0;
    const evolving:any={models:{retrieve:async()=>({max_input_tokens:1000000,max_tokens:32000})},messages:{
      countTokens:async(request:any)=>{
        const checkpoint=request.system.find((b:any)=>b.text.startsWith("Current durable checkpoint"));
        assert.ok(checkpoint);assert.match(checkpoint.text,/C-101/);assert.match(checkpoint.text,/feetPerPoint/);
        if(pricedCalls) {assert.match(checkpoint.text,/Claude named rate/);assert.match(checkpoint.text,/Known item/);}
        return {input_tokens:100};
      },
      create:async()=>{
        const checkpoint=pricedCalls++===0;
        return {usage:{input_tokens:100,output_tokens:500},content:[{type:"tool_use",id:checkpoint?"checkpoint-1":"submit-2",
          name:checkpoint?"checkpoint_takeoff":"submit_takeoff",input:{job:priced,summary:"Done",questions:[]}}]};
      },
    }};
    const evolvingRun=await makeRun(indexed);await executeClaimedRun(evolvingRun,{client:evolving,leaseOwner:owner});
    const [pricedDone]=await db.select().from(takeoffRuns).where(eq(takeoffRuns.id,evolvingRun.id));
    assert.equal(pricedDone.status,"needs_review");assert.equal(pricedCalls,2);
    assert.equal(pricedDone.state.originalRates!.rates.length,0);
    assert.equal(publicRun(pricedDone).addedRates[0].computedValue,50);
    assert.equal((publicRun(pricedDone) as any).messages,undefined);
    assert.equal((publicRun(pricedDone) as any).originalRates,undefined);
    assert.equal((publicRun(pricedDone).documents[0] as any).snapshotPath,undefined);

    // Restart after a checkpoint: the response is durable, so do not replay it.
    const restart=structuredClone(pricedDone.state);
    restart.messages=restart.messages.slice(0,-1);
    const resumedRates=await makeRun(restart);
    const finalOnly:any={messages:{countTokens:async(request:any)=>{assert.match(JSON.stringify(request.system),/Claude named rate/);return {input_tokens:100};},
      create:async()=>({usage:{input_tokens:100,output_tokens:200},content:[{type:"tool_use",id:"resubmit",name:"submit_takeoff",input:{job:priced,summary:"Resumed",questions:[]}}]})}};
    await executeClaimedRun(resumedRates,{client:finalOnly,leaseOwner:owner});
    const [resumedDone]=await db.select().from(takeoffRuns).where(eq(takeoffRuns.id,resumedRates.id));
    assert.equal(resumedDone.status,"needs_review");assert.equal(publicRun(resumedDone).addedRates[0].key,"added");
    assert.equal(resumedDone.state.originalRates!.rates.length,0);

    // Count before generation: progressively prune oversized payloads.
    const growing=state();
    for(let i=0;i<20;i++) growing.messages.push(
      {role:"assistant",content:[{type:"tool_use",id:`history-${i}`,name:"evaluate",input:{formula:"1"}}]},
      {role:"user",content:[{type:"tool_result",tool_use_id:`history-${i}`,content:"large tool result"}]},
    );
    let counts=0,generations=0;
    const bounded:any={models:{retrieve:async()=>({max_input_tokens:200000,max_tokens:24000})},messages:{
      countTokens:async()=>({input_tokens:++counts<4?700000:100}),
      create:async(request:any)=>{
        generations++;assert.equal(request.messages.length,1);assert.match(JSON.stringify(request.messages),/Earlier conversation/);
        return {usage:{input_tokens:100,output_tokens:200},content:[{type:"tool_use",id:"bounded-submit",name:"submit_takeoff",input:{job,summary:"Done",questions:[]}}]};
      },
    }};
    const boundedRun=await makeRun(growing);await executeClaimedRun(boundedRun,{client:bounded,leaseOwner:owner});
    const [boundedDone]=await db.select().from(takeoffRuns).where(eq(takeoffRuns.id,boundedRun.id));
    assert.equal(boundedDone.status,"needs_review");assert.equal(counts,4);assert.equal(generations,1);
    assert.equal(boundedDone.state.modelLimits!.input,172000);assert.ok(boundedDone.state.messages.length>40);
    const oversized:any={messages:{countTokens:async()=>({input_tokens:700000}),create:async()=>{throw new Error("Must not generate");}}};
    const blockedRun=await makeRun(state());await executeClaimedRun(blockedRun,{client:oversized,leaseOwner:owner});
    const [blocked]=await db.select().from(takeoffRuns).where(eq(takeoffRuns.id,blockedRun.id));
    assert.equal(blocked.status,"failed");assert.match(blocked.error!,/No generation request was sent/);
    assert.equal(blocked.state.cost,0);assert.equal(blocked.state.steps,0);assert.ok(blocked.state.originalRates);
    console.log("PASS mocked Claude submission, recovery, caps, cancellation, sheet index/scales, new rates, dynamic context and oversized-request guards; no Anthropic requests made");
  } finally {
    if(testObject)await(await new ObjectStorageService().getObjectEntityFile(testObject)).delete();
    if(oid){await db.delete(takeoffRuns).where(eq(takeoffRuns.opportunityId,oid));await db.delete(estimateRevisions).where(eq(estimateRevisions.opportunityId,oid));await db.delete(opportunities).where(eq(opportunities.id,oid));}
    await db.delete(notifications).where(eq(notifications.userId,tag));
    if(cid)await db.delete(customers).where(eq(customers.id,cid));
    await pool.end();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
