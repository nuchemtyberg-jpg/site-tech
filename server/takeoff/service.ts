import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { customers, estimateRevisions, estimatingAISettings, notifications, opportunities, takeoffPlaybooks, takeoffRules, takeoffRuns } from "@shared/schema";
import { aiSettingsSchema, type TakeoffState, type RunStatus, type LearnedRule, startTakeoffSchema } from "@shared/estimating/takeoff";
import { emptyJob, money } from "@shared/estimating/model";
import { computeJob, summarize } from "@shared/estimating/engine";
import { EstimateError, getCompanyRates } from "../services/estimating";
import { pinDocument } from "./preparation";
import { createHash } from "node:crypto";
import { takeoffSystem } from "./worker";
import { addedMaterialRates, ensureRateSnapshot } from "./rate-snapshot";
export type Run = typeof takeoffRuns.$inferSelect;
export async function getAISettings() {
  const [row]=await db.select().from(estimatingAISettings).where(eq(estimatingAISettings.id,1));
  return {settings:aiSettingsSchema.parse(row?.settings||{}),version:row?.version||0};
}
export async function getPlaybook() {
  return {versions:await db.select().from(takeoffPlaybooks).orderBy(desc(takeoffPlaybooks.id)),
    rules:await db.select().from(takeoffRules).orderBy(desc(takeoffRules.createdAt),desc(takeoffRules.id))};
}
export function publicRun(run:Run) {
  const s=run.state;
  return {id:run.id,opportunityId:run.opportunityId,createdBy:run.createdBy,status:run.status,revisionId:run.revisionId,
    error:run.error,createdAt:run.createdAt,startedAt:run.startedAt,finishedAt:run.finishedAt,
    model:s.settings.model,cost:s.cost,
    uncertainCost:(s.costEvents||[]).filter(e=>e.uncertain).reduce((n,e)=>n+e.amount,0),
    confirmedCost:s.cost-(s.costEvents||[]).filter(e=>e.uncertain).reduce((n,e)=>n+e.amount,0),
    costEvents:s.costEvents||[],
    steps:s.steps,budget:s.budget,stepLimit:s.stepLimit,usage:s.usage,progress:s.progress,
    documents:s.documents.map(({objectPath,snapshotPath,...d})=>d),instructions:s.instructions,trades:s.trades,
    playbookVersion:s.playbook.version,summary:s.summary,questions:s.questions||[],addedRates:addedMaterialRates(s),
    flags:s.job.categories.flatMap(cat=>cat.items.filter(line=>line.flag).map(line=>({
      type:line.flag.match(/NOT QUANTIFIED|BY OTHERS|ASSUMED|CONFLICT|VERIFY/i)?.[0].toUpperCase()||"VERIFY",
      lineId:line.id,categoryId:cat.id,description:line.desc,flag:line.flag,
    })))};
}
export async function startRun(opportunityId:number,userId:string,raw:unknown) {
  if(!process.env.ANTHROPIC_API_KEY) throw new EstimateError(503,"ANTHROPIC_API_KEY is missing. An administrator must add it to Secrets.");
  const input=startTakeoffSchema.parse(raw),config=await getAISettings(),playbook=await getPlaybook();
  const fingerprint=createHash("sha256").update(JSON.stringify({...input,requestKey:undefined,opportunityId})).digest("hex");
  const requestKey=input.requestKey || fingerprint;
  return db.transaction(async tx=>{
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}),hashtext(${requestKey}))`);
  const [existing]=await tx.select().from(takeoffRuns).where(and(eq(takeoffRuns.createdBy,userId),sql`${takeoffRuns.state}->>'requestKey'=${requestKey}`));
  if(existing) {
    if(existing.state.requestFingerprint!==fingerprint) throw new EstimateError(409,"This start request was already used with different selections. Reopen the wizard to start a different takeoff.");
    return publicRun(existing);
  }
  const [opp]=await db.select().from(opportunities).where(and(eq(opportunities.id,opportunityId),isNull(opportunities.deletedAt)));
  if(!opp) throw new EstimateError(404,"Opportunity not found");
  let job=emptyJob();
  if(input.revisionId) {
    const [revision]=await db.select().from(estimateRevisions).where(and(eq(estimateRevisions.id,input.revisionId),eq(estimateRevisions.opportunityId,opportunityId)));
    if(!revision) throw new EstimateError(404,"Source revision not found");
    job={...structuredClone(revision.job),categories:[]};
  } else {
    const [customer]=await db.select().from(customers).where(eq(customers.id,opp.customerId));
    job={...job,...(await getCompanyRates()).rates,name:opp.name,number:opp.opportunityNumber,client:customer?.name||"",
      location:[opp.streetAddress,opp.city,opp.state,opp.zip].filter(Boolean).join(", "),bidDate:opp.bidDueDate||""};
  }
  if(Object.keys(computeJob(job).errs).length) throw new EstimateError(422,"Fix formulas in the source rate tables before starting Claude.");
  const documents=[];
  for(const selection of input.documents) documents.push(await pinDocument(opportunityId,selection.fileId,selection.pages));
  const active=playbook.rules.filter(r=>r.active&&(r.appliesTo.toLowerCase()==="all"||input.trades.some(t=>t.toLowerCase()===r.appliesTo.toLowerCase())));
  const latest=playbook.versions[0];
  const state:TakeoffState={requestKey,requestFingerprint:fingerprint,preparationComplete:false,documents,instructions:input.instructions,trades:input.trades,settings:config.settings,
    playbook:{id:latest?.id||null,version:latest?.id||0,markdown:latest?.markdown||""},
    rules:active.map(r=>({...r,createdAt:r.createdAt.toISOString()})) as LearnedRule[],
    job,messages:[],scales:{},sheetIndexes:{},usage:{input:0,output:0,cacheRead:0,cacheWrite:0},cost:0,steps:0,
    budget:Math.min(config.settings.maxCost,input.approvedBudget),stepLimit:Math.min(config.settings.maxSteps,input.approvedSteps),progress:[{at:new Date().toISOString(),message:"Queued: documents and rate snapshot saved."}]};
  ensureRateSnapshot(state);
  state.systemSnapshot=JSON.stringify(takeoffSystem(state));
  const [run]=await tx.insert(takeoffRuns).values({opportunityId,createdBy:userId,state}).returning();
  return publicRun(run);
  });
}
export async function getRun(opportunityId:number,id:number) {
  const [row]=await db.select().from(takeoffRuns).where(and(eq(takeoffRuns.id,id),eq(takeoffRuns.opportunityId,opportunityId)));
  if(!row) throw new EstimateError(404,"Takeoff run not found");
  return row;
}
export function progress(state:TakeoffState,message:string) {
  state.progress.push({at:new Date().toISOString(),message});
  state.progress=state.progress.slice(-300);
}
export async function finishRun(run:Run,state:TakeoffState,status:RunStatus,owner:string,error?:string) {
  return db.transaction(async tx=>{
    const [current]=await tx.select().from(takeoffRuns).where(eq(takeoffRuns.id,run.id)).for("update");
    if(!current||current.leaseOwner!==owner) return;
    if(current.cancelRequested) status="cancelled";
    let revisionId=current.revisionId;
    if((status==="needs_review"||status==="stopped_at_cap")&&state.job.categories.length) {
      const result=computeJob(state.job),summary=summarize(state.job,result);
      if(Object.values(result.total).some(v=>!Number.isFinite(v))) throw new Error("Nonfinite takeoff totals");
      await tx.select({id:opportunities.id}).from(opportunities).where(eq(opportunities.id,run.opportunityId)).for("update");
      const [latest]=await tx.select().from(estimateRevisions).where(eq(estimateRevisions.opportunityId,run.opportunityId)).orderBy(desc(estimateRevisions.revisionNumber)).limit(1);
      const [revision]=await tx.insert(estimateRevisions).values({opportunityId:run.opportunityId,
        revisionNumber:(latest?.revisionNumber??-1)+1,name:`Claude takeoff — ${new Date().toISOString().slice(0,10)}${status==="stopped_at_cap"?" (partial)":""}`,
        job:state.job,summary,createdBy:run.createdBy,savedBy:run.createdBy}).returning();
      revisionId=revision.id;
      await tx.update(opportunities).set({expectedValue:Math.round(summary.sell),expectedValueEstimateRevision:revision.revisionNumber,updatedAt:new Date()}).where(eq(opportunities.id,run.opportunityId));
      const largest=state.job.categories.flatMap(c=>c.items.filter(l=>!l.excluded&&!c.excluded).map(l=>({description:l.desc,sell:result.items[l.id].sell}))).sort((a,b)=>b.sell-a.sell).slice(0,5);
      state.summary=`SiteTech calculated sell: ${money(summary.sell)}; direct cost: ${money(summary.cost)}.\nLargest lines:\n${largest.map(l=>`${l.description}: ${money(l.sell)}`).join("\n")}\n\n${state.summary||""}`;
    }
    progress(state,status==="needs_review"?"Takeoff ready for estimator review.":status==="stopped_at_cap"?"Stopped at the approved limit. Review partial work or approve more spending.":status==="cancelled"?"Cancelled.":error||"Run ended.");
    await tx.update(takeoffRuns).set({state,status,revisionId,error:error||null,leaseOwner:null,leaseUntil:null,finishedAt:new Date(),updatedAt:new Date()}).where(eq(takeoffRuns.id,run.id));
    await tx.insert(notifications).values({userId:run.createdBy,type:"general",title:status==="needs_review"?"Claude takeoff ready":"Claude takeoff update",
      message:`Opportunity ${run.opportunityId}: ${state.progress.at(-1)!.message}`,relatedEntityType:"opportunity",relatedEntityId:run.opportunityId});
  });
}
export async function monthlySpend() {
  const result=await db.execute(sql`SELECT coalesce(sum((event->>'amount')::numeric),0) AS total
    FROM takeoff_runs, jsonb_array_elements(coalesce(state->'costEvents','[]'::jsonb)) event
    WHERE (event->>'at')::timestamptz >= date_trunc('month', now())`);
  return Number((result.rows[0] as any).total);
}
