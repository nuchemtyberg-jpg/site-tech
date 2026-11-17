import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { estimatingRateHistory, users } from "@shared/schema";
import { MARKUPS, ratesSchema } from "@shared/estimating/model";
import { RATE_TABS, type RatePreview } from "@shared/estimating/rate-import";
import { EstimateError, getCompanyRates, saveCompanyRates } from "./estimating";
import { mergeRates } from "./rate-merge";
import { parseRateFiles } from "./rate-spreadsheet";

const inputSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("spreadsheet"), files: z.array(z.object({
    name: z.string().min(1).max(240), data: z.string().max(14 * 1024 * 1024).regex(/^[A-Za-z0-9+/]*={0,2}$/),
    tab: z.enum(RATE_TABS).optional(),
  })).min(1).max(4) }),
  z.object({ source: z.literal("estimate"), rates: ratesSchema, replaceDefaultMarkups: z.boolean().default(false) }),
]);
function signature(payload: string) {
  if (!process.env.SESSION_SECRET) throw new EstimateError(503, "Rate confirmation is unavailable; session configuration is missing.");
  return createHmac("sha256", process.env.SESSION_SECRET).update(`company-rates-preview:${payload}`).digest("base64url");
}
export async function previewRateImport(raw: unknown, userId: string): Promise<RatePreview> {
  const input = inputSchema.parse(raw), current = await getCompanyRates();
  let parsed;
  try {
    parsed = input.source === "spreadsheet" ? await parseRateFiles(input.files) : {
      rates: input.rates, errors: [], warnings: [], locations: {},
      markupKeys: input.replaceDefaultMarkups ? [...MARKUPS] : [],
    };
  } catch (e) { throw new EstimateError(400, e instanceof Error ? e.message : "Could not read spreadsheet."); }
  let merged;
  try { merged = mergeRates(current.rates, parsed.rates, { matchById: input.source === "estimate", markupKeys: parsed.markupKeys, locations: parsed.locations }); }
  catch (e) {
    if (!(e instanceof z.ZodError)) throw e;
    return { version: current.version, changes: [], counts: { new: 0, changed: 0, unchanged: 0 },
      errors: [...parsed.errors, ...e.issues.map(i => `${i.path.join(".")}: ${i.message}`)], warnings: parsed.warnings };
  }
  const { rates, ...preview } = merged;
  preview.errors.unshift(...parsed.errors); preview.warnings.unshift(...parsed.warnings);
  const result: RatePreview = { ...preview, version: current.version };
  if (!result.errors.length && result.changes.length) {
    const payload = Buffer.from(JSON.stringify({
      userId, version: current.version, rates, expires: Date.now() + 30 * 60 * 1000,
      source: input.source === "estimate" ? "Estimate rates" : `Spreadsheet: ${input.files.map(f => f.name).join(", ")}`,
    })).toString("base64url");
    if (payload.length > 5 * 1024 * 1024) throw new EstimateError(413, "Rate preview exceeds 5 MB. Shorten notes or split the import.");
    result.token = `${payload}.${signature(payload)}`;
  }
  return result;
}
export async function applyRateImport(raw: unknown, userId: string) {
  const { token } = z.object({ token: z.string().max(5 * 1024 * 1024 + 100).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/) }).parse(raw);
  const parts = token.split(".");
  if (parts.length !== 2) throw new EstimateError(400, "Invalid preview. Generate a new preview.");
  const [payload, supplied] = parts, expected = signature(payload);
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)))
    throw new EstimateError(400, "Preview was changed. Generate a new preview.");
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (data.userId !== userId) throw new EstimateError(403, "Generate a preview using your own account.");
  if (data.expires < Date.now()) throw new EstimateError(409, "Preview expired. Generate a new preview.");
  return saveCompanyRates(data.rates, data.version, userId, data.source);
}
const columns = {
  id: estimatingRateHistory.id, version: estimatingRateHistory.version, savedBy: estimatingRateHistory.savedBy,
  savedAt: estimatingRateHistory.savedAt, source: estimatingRateHistory.source,
  author: sql<string>`coalesce(nullif(trim(concat_ws(' ', ${users.firstName}, ${users.lastName})), ''), ${users.email}, ${estimatingRateHistory.savedBy})`,
};
export async function rateHistory(id?: number) {
  if (id !== undefined) {
    const [row] = await db.select({ ...columns, rates: estimatingRateHistory.rates }).from(estimatingRateHistory)
      .leftJoin(users, eq(users.id, estimatingRateHistory.savedBy)).where(eq(estimatingRateHistory.id, id));
    if (!row) throw new EstimateError(404, "Rate history entry not found.");
    return row;
  }
  return db.select(columns).from(estimatingRateHistory).leftJoin(users, eq(users.id, estimatingRateHistory.savedBy))
    .orderBy(desc(estimatingRateHistory.version)).limit(100);
}
