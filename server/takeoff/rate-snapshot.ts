import { isDeepStrictEqual } from "node:util";
import { ratesSchema, type EstimateJob, type EstimateRates } from "@shared/estimating/model";
import { makeResolver } from "@shared/estimating/formulas";
import type { AddedMaterialRate, TakeoffState } from "@shared/estimating/takeoff";

const keyOf = (key: string) => key.trim().toLowerCase();
export function ensureRateSnapshot(state: TakeoffState) {
  // Before append-only rates shipped, every checkpoint kept its input rates.
  // That makes the saved job a trustworthy baseline for legacy active runs.
  state.originalRates ??= structuredClone(ratesSchema.parse(state.job));
}
export function assertAppendOnlyRates(job: EstimateJob, state: TakeoffState) {
  const baseline = state.originalRates ?? ratesSchema.parse(state.job);
  for (const protectedRates of [baseline, ratesSchema.parse(state.job)]) {
    for (const field of ["laborRates", "equipRates", "defaults", "markupNotes"] as const) {
      if (!isDeepStrictEqual(job[field], protectedRates[field])) throw new Error(`Keep the supplied ${field} unchanged.`);
    }
    for (const row of protectedRates.rates) {
      const match = job.rates.find(r => keyOf(r.key) === keyOf(row.key));
      if (!match || !isDeepStrictEqual(match, row)) throw new Error(`Keep existing material rate "${row.key}" unchanged (including its ID and metadata).`);
    }
  }
  const existing = new Set(state.job.rates.map(r => keyOf(r.key)));
  const seen = new Set<string>();
  for (const row of job.rates) {
    const key = keyOf(row.key);
    if (seen.has(key)) throw new Error(`Duplicate material rate key "${row.key}".`);
    seen.add(key);
    if (!existing.has(key)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(row.key) || ["qty", "__proto__", "constructor", "prototype"].includes(key))
        throw new Error(`Invalid or reserved material rate key "${row.key}".`);
      if (!row.desc.trim() || !row.unit.trim() || !row.value.trim())
        throw new Error(`New material rate "${row.key}" needs a description, unit and value/formula.`);
    }
  }
}
export function addedMaterialRates(state: TakeoffState): AddedMaterialRate[] {
  // Old completed runs did not allow additions. Do not invent provenance.
  if (!state.originalRates) return [];
  const original = new Set(state.originalRates.rates.map(r => keyOf(r.key)));
  const resolver = makeResolver(state.job);
  return state.job.rates.filter(r => !original.has(keyOf(r.key))).map(row => {
    const result = resolver.ev(row.value);
    return { ...row, computedValue: result.err ? null : result.v };
  });
}
