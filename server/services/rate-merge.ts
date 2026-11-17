import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { computeJob } from "@shared/estimating/engine";
import { emptyJob, jobSchema, ratesSchema, type EstimateRates, type MarkupKey } from "@shared/estimating/model";
import type { RateChange, RateTab } from "@shared/estimating/rate-import";

// Custom units already present in company rates remain valid. New units need
// an explicit recognized spelling; no guessed conversions are ever applied.
export const MATERIAL_UNITS = new Set(("EA EACH LF FT FOOT FEET SF SQFT SQ FT SY SQYD CY CUYD CF CUFT LB LBS POUND POUNDS TON TONS TN HR HOUR DAY WK WEEK MO MONTH LS LUMP SUM GAL GALLON GALLONS BAG BAGS ROLL ROLLS LOAD LOADS PALLET PALLETS SHEET SHEETS SET SETS PC PCS PIECE PIECES IN INCH M M2 M3 KG L LITER LITRE").split(" "));
["SQ FT", "SQ YD", "CU YD", "CU FT", "LUMP SUM", "SQUARE FEET", "CUBIC YARDS"].forEach(u => MATERIAL_UNITS.add(u));
const norm = (s: string) => s.trim().toLowerCase();
function display(row: Record<string, unknown>, material = false): Record<string, string> {
  const out: Record<string, string> = { ...Object.fromEntries(Object.entries(row).filter(([key]) => key !== "id").map(([k, v]) => [k, String(v ?? "")])), notes: String(row.notes ?? "") };
  if (material) out.category = String(row.category ?? "");
  return out;
}
export function mergeRates(currentRaw: EstimateRates, incomingRaw: EstimateRates, options: {
  matchById: boolean; markupKeys: MarkupKey[]; locations?: Record<string, string>;
}) {
  const current = ratesSchema.parse(currentRaw), incoming = ratesSchema.parse(incomingRaw);
  const rates = structuredClone(current), errors: string[] = [], warnings: string[] = [], changes: RateChange[] = [];
  const locations = { ...options.locations };
  const usedIds = new Set([...rates.rates, ...rates.laborRates, ...rates.equipRates].map(r => r.id));
  const units = new Set([...MATERIAL_UNITS, ...current.rates.map(r => r.unit.trim().toUpperCase()).filter(Boolean)]);
  for (const [field, section] of [["rates", "Materials"], ["laborRates", "Labor"], ["equipRates", "Equipment"]] as const) {
    const source = incoming[field], target = rates[field];
    const seen = new Set<string>(), matched = new Set<string>();
    for (const row of source) {
      const material = field === "rates";
      const label = "key" in row ? row.key : row.name, key = norm(label);
      const where = options.locations?.[row.id] || `${section}: ${label || "(blank)"}`;
      if (!key) { errors.push(`${where}: ${material ? "Key" : "Type name"} is required.`); continue; }
      if (seen.has(key)) { errors.push(`${where}: duplicate ${material ? "key" : "type name"} "${label}".`); continue; }
      seen.add(key);
      if ("key" in row && (!/^[a-z_][a-z0-9_]*$/i.test(row.key.trim()) || ["qty", "__proto__", "constructor", "prototype"].includes(key))) {
        errors.push(`${where}: invalid or reserved material key "${label}".`); continue;
      }
      if ("unit" in row) {
        if (row.unit.trim() && !units.has(row.unit.trim().toUpperCase())) errors.push(`${where}: unknown unit "${row.unit}".`);
        if (!row.unit.trim()) warnings.push(`${where}: no unit.`);
        if (!row.value.trim()) warnings.push(`${where}: no price; blank prices count as zero until supplied.`);
      }
      const idMatch = options.matchById && !material ? target.find(r => r.id === row.id) : undefined;
      const candidates = idMatch ? [idMatch] : target.filter(r => norm("key" in r ? r.key : r.name) === key);
      if (candidates.length > 1) { errors.push(`${where}: ambiguous company match; rename duplicate company types first.`); continue; }
      const old = candidates[0];
      if (old && matched.has(old.id)) { errors.push(`${where}: more than one incoming row matches the same company rate.`); continue; }
      if (old) matched.add(old.id);
      // Incoming estimate IDs may also be used by a different company table.
      // Allocate a fresh ID for new types; never change existing company IDs.
      let id = old?.id || row.id;
      if (!old && usedIds.has(id)) id = randomUUID();
      usedIds.add(id); locations[id] = where;
      const next = { ...row, id };
      const before = old ? display(old, material) : undefined, after = display(next, material);
      changes.push({ section, label, status: !before ? "new" : isDeepStrictEqual(before, after) ? "unchanged" : "changed", before, after });
      const index = old ? target.findIndex(r => r.id === old.id) : -1;
      // Each section has a different row shape; source and target share the section.
      if (index >= 0) (target as any[])[index] = next; else (target as any[]).push(next);
    }
  }
  for (const key of options.markupKeys) {
    const before = { value: current.defaults[key], notes: current.markupNotes?.[key] || "" };
    const after = { value: incoming.defaults[key], notes: incoming.markupNotes?.[key] || "" };
    changes.push({ section: "Markups", label: key, status: isDeepStrictEqual(before, after) ? "unchanged" : "changed", before, after });
    rates.defaults[key] = after.value;
    rates.markupNotes ??= { tax: "", oh: "", ins: "", profit: "" };
    rates.markupNotes[key] = after.notes;
  }
  const checked = jobSchema.safeParse({ ...emptyJob(), ...rates });
  if (!checked.success) errors.push(...checked.error.issues.map(e => `${e.path.join(".")}: ${e.message}`));
  else {
    const computed = computeJob(checked.data);
    for (const [field, error] of Object.entries(computed.errs)) {
      const rowId = field.split(":")[0];
      errors.push(`${locations[field] || locations[rowId] || field}: ${error}`);
    }
    if (Object.values(computed.tables).some(table => Object.values(table).some(row => Object.values(row).some(n => n !== null && !Number.isFinite(n)))))
      errors.push("Derived rates must be finite.");
  }
  if (!changes.length && !errors.length) warnings.push("No rate rows to import.");
  const counts = { new: 0, changed: 0, unchanged: 0 };
  changes.forEach(c => counts[c.status]++);
  return { rates, changes, counts, errors, warnings };
}
