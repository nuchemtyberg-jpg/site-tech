import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { opportunities, estimateRevisions, estimatingCompanyRates, estimatingRateHistory, customers } from "@shared/schema";
import { computeJob, summarize } from "@shared/estimating/engine";
import { emptyJob, jobSchema, ratesSchema, importTakeoff, type EstimateJob } from "@shared/estimating/model";

export class EstimateError extends Error {
  constructor(public status: number, message: string, public details: Record<string, unknown> = {}) { super(message); }
}
export async function getCompanyRates() {
  const [row] = await db.select().from(estimatingCompanyRates).where(eq(estimatingCompanyRates.id, 1));
  return row ? { rates: ratesSchema.parse(row.rates), version: row.version } : { rates: ratesSchema.parse({}), version: 0 };
}
export function validateCalculation(job: EstimateJob, allowFormulaErrors = true) {
  const result = computeJob(job);
  if (!allowFormulaErrors && Object.keys(result.errs).length) throw new EstimateError(422, "Correct invalid formulas before saving.", { errors: result.errs });
  // Draft formulas may be invalid, but overflow in any calculated amount must
  // never enter JSON storage (including excluded rows and categories).
  const finite = (value: unknown): boolean => typeof value === "number" ? Number.isFinite(value) :
    value !== null && typeof value === "object" ? Object.values(value).every(finite) : true;
  if (!finite(result)) throw new EstimateError(422, "Calculated amounts must be finite numbers.");
  if (Math.abs(Math.round(result.total.sell)) > 2147483647) throw new EstimateError(422, "Total is outside the supported Opportunity Expected Value range.");
  return summarize(job, result);
}
export async function saveCompanyRates(raw: unknown, version: number, userId: string, source = "Manual edit") {
  const rates = ratesSchema.parse(raw);
  const validationJob = jobSchema.parse({ ...emptyJob(), ...rates });
  validateCalculation(validationJob, false);
  return db.transaction(async tx => {
    const [previous] = await tx.select().from(estimatingCompanyRates).where(eq(estimatingCompanyRates.id, 1)).for("update");
    if ((previous?.version ?? 0) !== version) throw new EstimateError(409, "Company rates were changed by someone else. Reload and preview again.");
    const [saved] = previous
      ? await tx.update(estimatingCompanyRates).set({ rates, version: version + 1, savedBy: userId, savedAt: new Date() })
        .where(and(eq(estimatingCompanyRates.id, 1), eq(estimatingCompanyRates.version, version))).returning()
      : await tx.insert(estimatingCompanyRates).values({ id: 1, rates, savedBy: userId }).onConflictDoNothing().returning();
    if (!saved) throw new EstimateError(409, "Company rates were changed by someone else. Reload and preview again.");
    if (previous) await tx.insert(estimatingRateHistory).values({
      version: previous.version, rates: previous.rates, savedBy: previous.savedBy, savedAt: previous.savedAt, source: "Existing company rates",
    }).onConflictDoNothing();
    await tx.insert(estimatingRateHistory).values({ version: saved.version, rates: saved.rates, savedBy: userId, savedAt: saved.savedAt, source });
    return { rates: saved.rates, version: saved.version };
  });
}

export async function saveRevision(opportunityId: number, userId: string, input: { start?: boolean; importFile?: unknown; job?: unknown; name?: string; version?: number }, revisionId?: number) {
  return db.transaction(async tx => {
    // This parent lock serializes numbering, all revision writes, and Expected
    // Value updates, including saves of older revisions racing with a new one.
    const [opportunity] = await tx.select().from(opportunities).where(and(eq(opportunities.id, opportunityId), isNull(opportunities.deletedAt))).for("update");
    if (!opportunity) throw new EstimateError(404, "Opportunity not found");
    const [latest] = await tx.select().from(estimateRevisions).where(eq(estimateRevisions.opportunityId, opportunityId)).orderBy(desc(estimateRevisions.revisionNumber)).limit(1);
    let job: EstimateJob;
    if (input.start) {
      if (latest) throw new EstimateError(409, "An estimate already exists. Open its latest revision.");
      const [company] = await tx.select().from(estimatingCompanyRates).where(eq(estimatingCompanyRates.id, 1));
      const [customer] = await tx.select({ name: customers.name }).from(customers).where(eq(customers.id, opportunity.customerId));
      job = jobSchema.parse({ ...emptyJob(), ...(company?.rates ?? {}), name: opportunity.name, number: opportunity.opportunityNumber,
        client: customer?.name || "",
        location: [opportunity.streetAddress, opportunity.city, opportunity.state, opportunity.zip].filter(Boolean).join(", "), bidDate: opportunity.bidDueDate || "" });
    } else job = input.importFile !== undefined ? importTakeoff(input.importFile) : jobSchema.parse(input.job);
    const summary = validateCalculation(job);
    let saved;
    if (revisionId !== undefined) {
      const [current] = await tx.select().from(estimateRevisions).where(and(eq(estimateRevisions.id, revisionId), eq(estimateRevisions.opportunityId, opportunityId)));
      if (!current) throw new EstimateError(404, "Estimate revision not found");
      if (current.locked) throw new EstimateError(423, "This revision is attached to a proposal — save your changes as a new revision");
      if (current.version !== input.version) throw new EstimateError(409, "Someone else saved this revision. Load their version or save yours as a new revision.", { current });
      [saved] = await tx.update(estimateRevisions).set({ job, summary, version: current.version + 1, savedBy: userId, savedAt: new Date() })
        .where(eq(estimateRevisions.id, current.id)).returning();
    } else {
      [saved] = await tx.insert(estimateRevisions).values({ opportunityId, revisionNumber: (latest?.revisionNumber ?? -1) + 1,
        name: input.importFile !== undefined ? "Imported from takeoff form" : input.name || null,
        job, summary, createdBy: userId, savedBy: userId }).returning();
    }
    if (!latest || saved.revisionNumber >= latest.revisionNumber) {
      await tx.update(opportunities).set({ expectedValue: Math.round(summary.sell), expectedValueEstimateRevision: saved.revisionNumber, updatedAt: new Date() }).where(eq(opportunities.id, opportunityId));
    }
    return saved;
  });
}

/** Future proposal creation must call this in its own DB transaction, before
 * attaching the returned revision ID. There is deliberately no public unlock
 * endpoint. Holding the same parent lock prevents save/proposal races. */
export async function lockEstimateRevision(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], opportunityId: number, revisionId: number, expectedVersion: number, reason: string) {
  if (!reason.trim()) throw new EstimateError(400, "A lock reason is required");
  await tx.select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.id, opportunityId)).for("update");
  const [row] = await tx.update(estimateRevisions).set({ locked: true, lockReason: reason })
    .where(and(eq(estimateRevisions.id, revisionId), eq(estimateRevisions.opportunityId, opportunityId), eq(estimateRevisions.version, expectedVersion))).returning();
  if (!row) throw new EstimateError(409, "Revision changed before it could be locked.");
  return row;
}
