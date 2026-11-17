import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { estimateRevisions, opportunities } from "@shared/schema";
import { canEstimate } from "@shared/estimating/model";
import { storage } from "./storage";
import { isAuthenticated } from "./replit_integrations/auth";
import { isAuthorizedUser } from "./middleware/auth";
import { EstimateError, getCompanyRates, saveCompanyRates, saveRevision } from "./services/estimating";
import { previewRateImport, applyRateImport, rateHistory } from "./services/rate-import";

export function registerEstimatingRoutes(app: Express) {
  const permitted: RequestHandler = async (req, res, next) => {
    const user = await storage.getUser((req.user as any)?.claims?.sub);
    if (!canEstimate(user?.role)) return res.status(403).json({ message: "Estimating access required" });
    next();
  };
  const guard = [isAuthenticated, isAuthorizedUser, permitted];
  const wrap = (fn: RequestHandler): RequestHandler => async (req, res, next) => {
    try { await fn(req, res, next); } catch (error) {
      if (error instanceof EstimateError) return res.status(error.status).json({ message: error.message, ...error.details });
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Invalid estimate data", issues: error.issues });
      console.error("Estimating request failed:", error instanceof Error ? error.message : "Unknown error");
      res.status(500).json({ message: "Unable to save or load estimating data. Please try again." });
    }
  };
  const id = (value: unknown) => z.coerce.number().int().positive().parse(value);
  const userId = (req: any) => req.user.claims.sub as string;
  const parent = async (opportunityId: number) => {
    const [o] = await db.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.id, opportunityId), isNull(opportunities.deletedAt)));
    if (!o) throw new EstimateError(404, "Opportunity not found");
  };
  app.get("/api/estimating-rates", ...guard, wrap(async (_req, res) => { res.json(await getCompanyRates()); }));
  app.post("/api/estimating-rates/preview", ...guard, wrap(async (req, res) => { res.json(await previewRateImport(req.body, userId(req))); }));
  app.post("/api/estimating-rates/apply", ...guard, wrap(async (req, res) => { res.json(await applyRateImport(req.body, userId(req))); }));
  app.get("/api/estimating-rates/history", ...guard, wrap(async (_req, res) => { res.json(await rateHistory()); }));
  app.get("/api/estimating-rates/history/:id", ...guard, wrap(async (req, res) => { res.json(await rateHistory(id(req.params.id))); }));
  app.put("/api/estimating-rates", ...guard, wrap(async (req, res) => {
    const body = z.object({ rates: z.unknown(), version: z.number().int().nonnegative() }).parse(req.body);
    res.json(await saveCompanyRates(body.rates, body.version, userId(req)));
  }));
  app.get("/api/opportunities/:opportunityId/estimates", ...guard, wrap(async (req, res) => {
    const opportunityId = id(req.params.opportunityId); await parent(opportunityId);
    // Do not return every full job to populate a revision picker.
    const rows = await db.select({ id: estimateRevisions.id, opportunityId: estimateRevisions.opportunityId, revisionNumber: estimateRevisions.revisionNumber,
      name: estimateRevisions.name, summary: estimateRevisions.summary, version: estimateRevisions.version, locked: estimateRevisions.locked, lockReason: estimateRevisions.lockReason,
      createdBy: estimateRevisions.createdBy, createdAt: estimateRevisions.createdAt, savedBy: estimateRevisions.savedBy, savedAt: estimateRevisions.savedAt })
      .from(estimateRevisions).where(eq(estimateRevisions.opportunityId, opportunityId)).orderBy(desc(estimateRevisions.revisionNumber));
    res.json(rows);
  }));
  app.get("/api/opportunities/:opportunityId/estimates/:revisionId", ...guard, wrap(async (req, res) => {
    const opportunityId = id(req.params.opportunityId); await parent(opportunityId);
    const [row] = await db.select().from(estimateRevisions).where(and(eq(estimateRevisions.id, id(req.params.revisionId)), eq(estimateRevisions.opportunityId, opportunityId)));
    if (!row) throw new EstimateError(404, "Estimate revision not found");
    res.json(row);
  }));
  const createSchema = z.object({ job: z.unknown().optional(), start: z.boolean().optional(), importFile: z.unknown().optional(), name: z.string().trim().max(200).optional() })
    .refine(v => Number(v.start === true) + Number(v.job !== undefined) + Number(v.importFile !== undefined) === 1, "Supply exactly one of start, job, or importFile");
  app.post("/api/opportunities/:opportunityId/estimates", ...guard, wrap(async (req, res) => {
    res.status(201).json(await saveRevision(id(req.params.opportunityId), userId(req), createSchema.parse(req.body)));
  }));
  app.put("/api/opportunities/:opportunityId/estimates/:revisionId", ...guard, wrap(async (req, res) => {
    const body = z.object({ job: z.unknown(), version: z.number().int().positive() }).parse(req.body);
    res.json(await saveRevision(id(req.params.opportunityId), userId(req), body, id(req.params.revisionId)));
  }));
}
