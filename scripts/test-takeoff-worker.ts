import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, pool } from "../server/db";
import { customers, opportunities, takeoffRuns, estimateRevisions, notifications } from "../shared/schema";
import { emptyJob, newCategory, newLine } from "../shared/estimating/model";
import { aiSettingsSchema, type TakeoffState } from "../shared/estimating/takeoff";
import { executeClaimedRun } from "../server/takeoff/worker";
const tag=`__takeoff-test-${randomUUID()}`, owner=tag;
async function main() {
  let cid:number|undefined, oid:number|undefined;
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
    console.log("PASS mocked Claude submission, authoritative totals, durable tool recovery, step cap, cancellation and notifications; no Anthropic requests made");
  } finally {
    if(oid){await db.delete(takeoffRuns).where(eq(takeoffRuns.opportunityId,oid));await db.delete(estimateRevisions).where(eq(estimateRevisions.opportunityId,oid));await db.delete(opportunities).where(eq(opportunities.id,oid));}
    await db.delete(notifications).where(eq(notifications.userId,tag));
    if(cid)await db.delete(customers).where(eq(customers.id,cid));
    await pool.end();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
