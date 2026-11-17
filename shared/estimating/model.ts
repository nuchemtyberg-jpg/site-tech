import { z } from "zod";

export const canEstimate = (role: string | null | undefined) => ["admin", "manager", "estimator"].includes(role || "");
export const MARKUPS = ["tax", "oh", "ins", "profit"] as const;
export const CALCS = {
  qty: { label: "Plain quantity", unit: "", fields: ["qty"] },
  ea: { label: "EA · count", unit: "EA", fields: ["n"] },
  lf: { label: "LF · count × length", unit: "LF", fields: ["n", "l"] },
  lbs: { label: "LBS · count × length × weight", unit: "LBS", fields: ["n", "l", "wt"] },
  tons: { label: "TONS · pounds ÷ 2000", unit: "TON", fields: ["n", "l", "wt"] },
  sf: { label: "SF · count × length × width", unit: "SF", fields: ["n", "l", "w"] },
  sy: { label: "SY · square feet ÷ 9", unit: "SY", fields: ["n", "l", "w"] },
  cy: { label: "CY · count × length × width × depth ÷ 27", unit: "CY", fields: ["n", "l", "w", "d"] },
} as const;
const str = z.string().max(10000).default("");
const expr = z.string().max(500).default("");
const id = z.string().min(1).max(160).refine(value => !["__proto__", "constructor", "prototype"].includes(value), "Reserved record ID");
const markupShape = { tax: expr, oh: expr, ins: expr, profit: expr };
export const defaultsSchema = z.object(markupShape).default({});
const dimensions = { calc: z.enum(["qty", "ea", "lf", "lbs", "tons", "sf", "sy", "cy"]).default("qty"), n: expr, l: expr, w: expr, d: expr, wt: expr, qty: expr, unit: str };
const material = z.object({ id, desc: str, ...dimensions, waste: expr, cost: expr });
const typedRow = z.object({ id, desc: str, ltype: str, etype: str, crew: expr, dur: expr, basis: z.enum(["", "hr", "day", "wk", "mo"]).default("day"), rate: expr });
const subRow = z.object({ id, desc: str, qty: expr, unit: str, cost: expr });
export const lineSchema = z.object({
  id, desc: str, size: str, ...dimensions, ref: str, flag: str,
  excluded: z.boolean().default(false), ...markupShape, priceOverride: expr,
  res: z.object({
    mat: z.array(material).max(2000).default([]), lab: z.array(typedRow).max(2000).default([]),
    eq: z.array(typedRow).max(2000).default([]), sub: z.array(subRow).max(2000).default([]),
  }).default({}),
});
export const categorySchema = z.object({ id, name: str, ...markupShape, excluded: z.boolean().default(false), items: z.array(lineSchema).max(2000).default([]) });
export const ratesSchema = z.object({
  rates: z.array(z.object({ id, key: z.string().max(100).default(""), desc: str, unit: str, value: expr, category: z.string().max(200).optional(), notes: z.string().max(10000).optional() })).max(1000).default([]),
  laborRates: z.array(z.object({ id, name: str, hr: expr, day: expr, notes: z.string().max(10000).optional() })).max(1000).default([]),
  equipRates: z.array(z.object({ id, name: str, hr: expr, day: expr, wk: expr, mo: expr, notes: z.string().max(10000).optional() })).max(1000).default([]),
  defaults: defaultsSchema,
  markupNotes: z.object({ tax: str, oh: str, ins: str, profit: str }).optional(),
});
export const jobSchema = ratesSchema.extend({
  name: str, number: str, client: str, location: str, bidDate: str, preparedBy: str,
  notes: str, coverShowTakeoff: z.boolean().default(true),
  categories: z.array(categorySchema).max(500).default([]),
}).superRefine((job, ctx) => {
  const ids = new Set<string>(); let count = 0;
  const check = (value: { id: string }) => {
    if (ids.has(value.id)) ctx.addIssue({ code: "custom", message: `Duplicate record ID: ${value.id}` });
    ids.add(value.id); count++;
  };
  [...job.rates, ...job.laborRates, ...job.equipRates].forEach(check);
  for (const c of job.categories) { check(c); for (const l of c.items) { check(l); Object.values(l.res).flat().forEach(check); } }
  if (count > 20000) ctx.addIssue({ code: "custom", message: "Estimate exceeds 20,000 records" });
});
export type EstimateJob = z.infer<typeof jobSchema>;
export type EstimateRates = z.infer<typeof ratesSchema>;
export type EstimateLine = z.infer<typeof lineSchema>;
export type EstimateCategory = z.infer<typeof categorySchema>;
export type MarkupKey = typeof MARKUPS[number];
export type CalcType = keyof typeof CALCS;
export const newId = () => crypto.randomUUID();
export const newLine = () => lineSchema.parse({ id: newId() });
export const newCategory = () => categorySchema.parse({ id: newId(), name: "New category" });
export const emptyJob = () => jobSchema.parse({});
export const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

// Imports never inherit company defaults. Missing row IDs are generated once.
export function importTakeoff(input: unknown): EstimateJob {
  const envelope = z.object({ format: z.literal("nuchem-takeoff"), formatVersion: z.literal(1), job: z.record(z.unknown()) }).parse(input);
  const importStructure = z.object({
    categories: z.array(z.object({ items: z.array(z.object({ res: z.object({
      mat: z.array(z.record(z.unknown())).max(2000).default([]),
      lab: z.array(z.record(z.unknown())).max(2000).default([]),
      eq: z.array(z.record(z.unknown())).max(2000).default([]),
      sub: z.array(z.record(z.unknown())).max(2000).default([]),
    }).default({}) }).passthrough()).max(2000).default([]) }).passthrough()).max(500).default([]),
    rates: z.array(z.record(z.unknown())).max(1000).default([]),
    laborRates: z.array(z.record(z.unknown())).max(1000).default([]),
    equipRates: z.array(z.record(z.unknown())).max(1000).default([]),
  }).passthrough();
  const raw = importStructure.parse(structuredClone(envelope.job)) as any;
  const identify = (rows: any[]) => { for (const r of rows || []) { if (!r.id) r.id = newId(); } };
  identify(raw.rates); identify(raw.laborRates); identify(raw.equipRates); identify(raw.categories);
  for (const c of raw.categories || []) { identify(c.items); for (const l of c.items || []) for (const rows of Object.values(l.res || {})) identify(rows as any[]); }
  return jobSchema.parse({ ...raw, defaults: { tax: "0", oh: "0", ins: "0", profit: "0" } });
}

export interface EstimateRevision {
  id: number; opportunityId: number; revisionNumber: number; name: string | null;
  job: EstimateJob; summary: { sell: number; cost: number; margin: number; lineCount: number; categories: Array<{ id: string; name: string; sell: number; cost: number }>; warnings: Record<string, string> };
  version: number; locked: boolean; lockReason: string | null;
  createdBy: string; createdAt: string; savedBy: string; savedAt: string;
}
