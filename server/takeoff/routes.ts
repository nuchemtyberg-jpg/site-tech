import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { estimatingAISettings, takeoffPlaybooks, takeoffRules, takeoffRuns } from "@shared/schema";
import { canEstimate } from "@shared/estimating/model";
import { aiSettingsSchema, learnedRuleSchema } from "@shared/estimating/takeoff";
import { storage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { isAuthorizedUser } from "../middleware/auth";
import { EstimateError } from "../services/estimating";
import { documentThumbnail, inspectBytes, opportunityDocuments, permittedFile, readObject } from "./documents";
import { getAISettings, getPlaybook, getRun, monthlySpend, progress, publicRun, startRun } from "./service";
import { abortRun } from "./worker";
import { pinDocument, getPreparation } from "./preparation";
import { takeoffRequestDiagnostics } from "./diagnostics";
import { freshCheckpointConversation } from "./context";
import { takeoffSystem } from "./worker";
const id=(raw:unknown)=>z.coerce.number().int().positive().parse(raw);
export function registerTakeoffRoutes(app:Express) {
  const permitted:RequestHandler=async(req,res,next)=>{
    const user=await storage.getUser((req.user as any)?.claims?.sub);
    if(!canEstimate(user?.role)) return res.status(403).json({message:"Estimating access required"});
    next();
  };
  const admin:RequestHandler=async(req,res,next)=>{
    const user=await storage.getUser((req.user as any)?.claims?.sub);
    if(user?.role!=="admin") return res.status(403).json({message:"Administrator access required"});
    next();
  };
  const guard=[isAuthenticated,isAuthorizedUser,permitted];
  const uid=(req:any)=>req.user.claims.sub as string;
  const wrap=(fn:RequestHandler):RequestHandler=>async(req,res,next)=>{
    try{await fn(req,res,next);}catch(error){
      if(error instanceof EstimateError) return res.status(error.status).json({message:error.message});
      if(error instanceof z.ZodError) return res.status(400).json({message:"Invalid takeoff data",issues:error.issues});
      console.error("Takeoff request failed:",error instanceof Error?error.message:"Unknown error");
      res.status(500).json({message:"Unable to process takeoff data or document. Check the file is readable and try again."});
    }
  };
  app.get("/api/admin/estimating-ai",...guard,admin,wrap(async(_req,res)=>{
    res.json({...await getAISettings(),monthSpend:await monthlySpend(),runs:(await db.select().from(takeoffRuns).orderBy(desc(takeoffRuns.id)).limit(200)).map(publicRun)});
  }));
  app.put("/api/admin/estimating-ai",...guard,admin,wrap(async(req,res)=>{
    const body=z.object({settings:aiSettingsSchema,version:z.number().int().nonnegative()}).parse(req.body);
    let saved;
    if(body.version===0) [saved]=await db.insert(estimatingAISettings).values({id:1,settings:body.settings,savedBy:uid(req)}).onConflictDoNothing().returning();
    else [saved]=await db.update(estimatingAISettings).set({settings:body.settings,savedBy:uid(req),savedAt:new Date(),version:body.version+1})
      .where(and(eq(estimatingAISettings.id,1),eq(estimatingAISettings.version,body.version))).returning();
    if(!saved) throw new EstimateError(409,"AI settings changed. Reload before saving.");
    res.json({settings:saved.settings,version:saved.version});
  }));
  app.get("/api/takeoff-playbook",...guard,wrap(async(_req,res)=>{res.json(await getPlaybook());}));
  app.post("/api/takeoff-playbook",...guard,wrap(async(req,res)=>{
    const body=z.object({markdown:z.string().max(150000),restoredFrom:z.number().int().positive().optional()}).parse(req.body);
    if(body.restoredFrom) {
      const [source]=await db.select().from(takeoffPlaybooks).where(eq(takeoffPlaybooks.id,body.restoredFrom));
      if(!source) throw new EstimateError(404,"Playbook version not found");
      body.markdown=source.markdown;
    }
    const [saved]=await db.insert(takeoffPlaybooks).values({...body,createdBy:uid(req)}).returning();res.status(201).json(saved);
  }));
  app.post("/api/takeoff-playbook/rules",...guard,wrap(async(req,res)=>{
    const [saved]=await db.insert(takeoffRules).values({...learnedRuleSchema.parse(req.body),addedBy:uid(req)}).returning();res.status(201).json(saved);
  }));
  app.put("/api/takeoff-playbook/rules/:ruleId",...guard,wrap(async(req,res)=>{
    const [saved]=await db.update(takeoffRules).set({...learnedRuleSchema.parse(req.body),updatedAt:new Date()}).where(eq(takeoffRules.id,id(req.params.ruleId))).returning();
    if(!saved) throw new EstimateError(404,"Rule not found");res.json(saved);
  }));
  const root="/api/opportunities/:opportunityId/takeoff";
  app.use(root,takeoffRequestDiagnostics);
  app.get(`${root}/config`,...guard,wrap(async(_req,res)=>{
    const {settings}=await getAISettings();res.json({model:settings.model,maxCost:settings.maxCost,maxSteps:settings.maxSteps,estimatedInputPerPage:3000,prices:settings.prices[settings.model]});
  }));
  app.get(`${root}/documents`,...guard,wrap(async(req,res)=>{
    res.json((await opportunityDocuments(id(req.params.opportunityId))).map(f=>({id:f.id,name:f.name,contentType:f.contentType,source:f.source})));
  }));
  app.get(`${root}/documents/:fileId/sheets`,...guard,wrap(async(req,res)=>{
    const file=await pinDocument(id(req.params.opportunityId),id(req.params.fileId),[]);
    const prep=await getPreparation(file.preparationKey!);
    if(prep.status==="failed") throw new EstimateError(422,prep.error||"Document preparation failed.");
    res.status(prep.status==="ready"?200:202).json({status:prep.status,pages:prep.manifest?.pages.map(({textPath,vectorsPath,thumbnailPath,...p})=>p)||[]});
  }));
  app.get(`${root}/documents/:fileId/pages/:page/thumbnail`,...guard,wrap(async(req,res)=>{
    const file=await pinDocument(id(req.params.opportunityId),id(req.params.fileId),[]);
    const prep=await getPreparation(file.preparationKey!);
    const sheet=prep.manifest?.pages.find(p=>p.page===id(req.params.page));
    if(!sheet) throw new EstimateError(409,"Thumbnail is still preparing.");
    res.set("Cache-Control","private, max-age=300").type("png").send(await readObject(sheet.thumbnailPath));
  }));
  app.get(`${root}/runs`,...guard,wrap(async(req,res)=>{
    res.json((await db.select().from(takeoffRuns).where(eq(takeoffRuns.opportunityId,id(req.params.opportunityId))).orderBy(desc(takeoffRuns.id))).map(publicRun));
  }));
  app.post(`${root}/runs`,...guard,wrap(async(req,res)=>{res.status(201).json(await startRun(id(req.params.opportunityId),uid(req),req.body));}));
  app.post(`${root}/runs/:runId/retry`,...guard,wrap(async(req,res)=>{
    const result=await db.transaction(async tx=>{
      const [run]=await tx.select().from(takeoffRuns).where(and(eq(takeoffRuns.id,id(req.params.runId)),eq(takeoffRuns.opportunityId,id(req.params.opportunityId)))).for("update");
      if(!run||run.status!=="failed") throw new EstimateError(409,"Only a failed run can be retried. Refresh its current status.");
      const state=structuredClone(run.state);
      if(state.cost>=state.budget||state.steps>=state.stepLimit) throw new EstimateError(409,"This run has exhausted its approved limits. Retry cannot increase them.");
      delete state.retryAt;delete state.retries;
      delete state.networkRetries;
      delete state.checkpointTurnStep;
      if(!state.systemSnapshot || /invalid signature|thinking block|bound to a different conversation|system prompt differs/i.test(run.error||"")) {
        freshCheckpointConversation(state,"Retry recovered a non-replayable conversation from its checkpoint.");
        delete state.systemSnapshot;delete state.contextProtocol;delete state.toolsSnapshot;delete state.truncatedResponses;
      }
      // Keep pendingCall: interrupted generation must retain its conservative reservation.
      progress(state,"Estimator requested retry from the last checkpoint. Existing documents, rates, settings, spend and approved limits are unchanged.");
      const [saved]=await tx.update(takeoffRuns).set({state,status:"queued",error:null,cancelRequested:false,leaseOwner:null,leaseUntil:null,finishedAt:null,updatedAt:new Date()})
        .where(eq(takeoffRuns.id,run.id)).returning();
      return saved;
    });
    res.json(publicRun(result));
  }));
  app.post(`${root}/runs/:runId/cancel`,...guard,wrap(async(req,res)=>{
    const run=await getRun(id(req.params.opportunityId),id(req.params.runId));
    if(!["queued","running"].includes(run.status)) throw new EstimateError(409,"Only a queued or running takeoff can be cancelled.");
    const [saved]=await db.update(takeoffRuns).set({cancelRequested:true,...(run.status==="queued"?{status:"cancelled" as const,finishedAt:new Date()}:{}),updatedAt:new Date()})
      .where(and(eq(takeoffRuns.id,run.id),eq(takeoffRuns.status,run.status))).returning();
    if(!saved) throw new EstimateError(409,"Run status changed; refresh.");
    abortRun(run.id);res.json(publicRun(saved));
  }));
  app.post(`${root}/runs/:runId/continue`,...guard,wrap(async(req,res)=>{
    const body=z.object({additionalBudget:z.number().min(.1).max(10000),additionalSteps:z.number().int().min(1).max(1000)}).parse(req.body);
    const result=await db.transaction(async tx=>{
      const [run]=await tx.select().from(takeoffRuns).where(and(eq(takeoffRuns.id,id(req.params.runId)),eq(takeoffRuns.opportunityId,id(req.params.opportunityId)))).for("update");
      if(!run||run.status!=="stopped_at_cap") throw new EstimateError(409,"Only capped runs can be continued.");
      const state=structuredClone(run.state);state.budget+=body.additionalBudget;state.stepLimit+=body.additionalSteps;
      delete state.capSubmission;
      delete state.checkpointTurnStep;
      const last:any=state.messages.at(-1);
      if(last?.role==="assistant"&&Array.isArray(last.content)) {
        const calls=last.content.filter((b:any)=>b.type==="tool_use");
        if(calls.length) state.messages.push({role:"user",content:calls.map((call:any)=>({type:"tool_result",tool_use_id:call.id,content:"Partial submission saved as an immutable revision. Continue unfinished scope with the newly approved budget."}))});
      }
      state.messages.push({role:"user",content:`Estimator approved an additional $${body.additionalBudget} and ${body.additionalSteps} steps. Continue unfinished scope, then submit a new revision. Previous partial revisions must remain unchanged.`});
      progress(state,`Additional budget $${body.additionalBudget.toFixed(2)} and ${body.additionalSteps} steps approved.`);
      const [saved]=await tx.update(takeoffRuns).set({state,status:"queued",cancelRequested:false,error:null,leaseOwner:null,leaseUntil:null,finishedAt:null,updatedAt:new Date()}).where(eq(takeoffRuns.id,run.id)).returning();return saved;
    });
    res.json(publicRun(result));
  }));
  app.post(`${root}/runs/:runId/review`,...guard,wrap(async(req,res)=>{
    const run=await getRun(id(req.params.opportunityId),id(req.params.runId));
    if(run.status!=="needs_review") throw new EstimateError(409,"Only a completed takeoff awaiting review can be approved.");
    const state={...run.state,reviewedBy:uid(req),reviewedAt:new Date().toISOString()};
    const [saved]=await db.update(takeoffRuns).set({state,status:"completed",updatedAt:new Date()})
      .where(and(eq(takeoffRuns.id,run.id),eq(takeoffRuns.status,"needs_review"))).returning();
    if(!saved) throw new EstimateError(409,"Run status changed; refresh.");res.json(publicRun(saved));
  }));
}
