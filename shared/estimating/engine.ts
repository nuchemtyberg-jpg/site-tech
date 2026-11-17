import { CALCS, MARKUPS, type EstimateJob, type EstimateRates, type MarkupKey } from "./model";
import { blank, makeResolver, sizeWeight } from "./formulas";
export { makeResolver, sizeWeight } from "./formulas";
export const SUMKEYS = ["mat", "tax", "lab", "eq", "sub", "cost", "oh", "ins", "profit", "calcSell", "sell"] as const;
export type Totals = Record<typeof SUMKEYS[number], number>;
const zero = (): Totals => ({ mat: 0, tax: 0, lab: 0, eq: 0, sub: 0, cost: 0, oh: 0, ins: 0, profit: 0, calcSell: 0, sell: 0 });
const dims = ["n", "l", "w", "d", "wt", "qty"] as const;
export function measure(calc: string, v: Record<string, number | null>, autoWt: number | null = null) {
  const n = v.n == null ? (calc === "ea" ? 0 : 1) : v.n;
  const l = v.l || 0, w = v.w || 0, d = v.d || 0, wt = v.wt ?? autoWt ?? 0;
  const values: Record<string, number> = { qty: v.qty || 0, ea: n, lf: n * l, lbs: n * l * wt, tons: n * l * wt / 2000, sf: n * l * w, sy: n * l * w / 9, cy: n * l * w * d / 27 };
  return { q: values[calc] ?? values.qty, n, wt };
}
export function deriveRates(input: Record<string, number | null>, periods = ["hr", "day", "wk", "mo"]) {
  const factors: Record<string, number> = { hr: 1, day: 8, wk: 40, mo: 160 };
  const out: Record<string, number | null> = {};
  periods.forEach((period, index) => {
    const candidates = periods.map((p, i) => ({ p, i })).filter(({ p }) => input[p] != null)
      .sort((a, b) => Math.abs(a.i - index) - Math.abs(b.i - index) || a.i - b.i);
    const source = candidates[0]?.p;
    out[period] = source ? input[source]! * factors[period] / factors[source] : null;
  });
  return out;
}
export type LineResult = Totals & { qty: number; unit: string; unitPrice: number; calcUnit: number; margin: number; overridden: boolean; excluded: boolean; catExcluded: boolean; autoWt: number | null; eff: Record<MarkupKey, number> };
export interface Computation {
  total: Totals; margin: number; lineCount: number;
  items: Record<string, LineResult>;
  cats: Record<string, Totals & { excluded: boolean; exSell: number; exCount: number }>;
  res: Record<string, { q: number; c: number; amt: number; autoWt?: number | null }>;
  tables: { lab: Record<string, Record<string, number | null>>; eq: Record<string, Record<string, number | null>> };
  errs: Record<string, string>; warnings: Record<string, string>;
}
export function computeJob(job: EstimateJob): Computation {
  const R = makeResolver(job);
  const out: Computation = { total: zero(), margin: 0, lineCount: 0, items: {}, cats: {}, res: {}, tables: { lab: {}, eq: {} }, errs: {}, warnings: {} };
  const ev = (id: string, field: string, value: string, qty?: number) => {
    const r = R.ev(value, qty === undefined ? undefined : { qty });
    if (r.err) out.errs[`${id}:${field}`] = r.err;
    return r.err ? 0 : r.v;
  };
  for (const [kind, rows, periods] of [
    ["lab", job.laborRates, ["hr", "day"]], ["eq", job.equipRates, ["hr", "day", "wk", "mo"]],
  ] as const) {
    for (const row of rows) {
      const values: Record<string, number | null> = {};
      for (const p of periods) values[p] = ev(row.id, p, (row as any)[p]);
      out.tables[kind][row.id] = deriveRates(values, [...periods]);
    }
  }
  const defaultPct = Object.fromEntries(MARKUPS.map(f => [f, ev("defaults", f, job.defaults[f]) ?? 0])) as Record<MarkupKey, number>;
  for (const cat of job.categories) {
    const c = { ...zero(), excluded: cat.excluded, exSell: 0, exCount: 0 };
    const catPct = Object.fromEntries(MARKUPS.map(f => [f, blank(cat[f]) ? defaultPct[f] : ev(cat.id, f, cat[f]) ?? 0])) as Record<MarkupKey, number>;
    for (const it of cat.items) {
      const val = (f: string) => ev(it.id, f, (it as any)[f]);
      const autoWt = sizeWeight(it.size);
      const qty = measure(it.calc, Object.fromEntries(dims.map(f => [f, val(f)])), autoWt).q;
      const sums = zero();
      for (const row of it.res.mat) {
        const rv = (f: string) => ev(row.id, f, (row as any)[f], qty);
        const d = Object.fromEntries(dims.map(f => [f, rv(f)]));
        const aw = sizeWeight(row.desc);
        let base = measure(row.calc, d, aw).q;
        if (row.calc === "qty" && d.qty == null && !blank(row.cost)) base = 1;
        const q = base * (1 + (rv("waste") || 0) / 100), cost = rv("cost") || 0;
        out.res[row.id] = { q, c: cost, amt: q * cost, autoWt: aw }; sums.mat += q * cost;
      }
      for (const kind of ["lab", "eq"] as const) for (const row of it.res[kind]) {
        const crew = ev(row.id, "crew", row.crew, qty) ?? 1, dur = ev(row.id, "dur", row.dur, qty) || 0;
        const manual = ev(row.id, "rate", row.rate, qty);
        const typeId = kind === "lab" ? row.ltype : row.etype;
        const basis = row.basis || "day";
        const auto = out.tables[kind][typeId]?.[basis];
        if (typeId && auto == null && manual == null) out.warnings[`${row.id}:rate`] = `Missing ${kind === "lab" ? "labor" : "equipment"} rate; counted as zero. Select a valid type or enter a manual rate.`;
        const rate = manual ?? auto ?? 0, q = crew * dur;
        out.res[row.id] = { q, c: rate, amt: q * rate }; sums[kind] += q * rate;
      }
      for (const row of it.res.sub) {
        const q = ev(row.id, "qty", row.qty, qty) ?? (blank(row.qty) && !blank(row.cost) ? 1 : 0);
        const cost = ev(row.id, "cost", row.cost, qty) || 0;
        out.res[row.id] = { q, c: cost, amt: q * cost }; sums.sub += q * cost;
      }
      const eff = Object.fromEntries(MARKUPS.map(f => [f, blank(it[f]) ? catPct[f] : val(f) ?? catPct[f]])) as Record<MarkupKey, number>;
      sums.tax = sums.mat * eff.tax / 100;
      sums.cost = sums.mat + sums.tax + sums.lab + sums.eq + sums.sub;
      sums.oh = sums.cost * eff.oh / 100; sums.ins = (sums.cost + sums.oh) * eff.ins / 100;
      sums.profit = (sums.cost + sums.oh + sums.ins) * eff.profit / 100;
      sums.calcSell = sums.cost + sums.oh + sums.ins + sums.profit;
      const override = val("priceOverride");
      sums.sell = override == null ? sums.calcSell : override * (qty || 1);
      if (override != null) sums.profit = sums.sell - sums.cost - sums.oh - sums.ins;
      if (Object.values(sums).some(v => !Number.isFinite(v)) || !Number.isFinite(qty)) out.errs[`${it.id}:total`] = "Calculated amount is too large";
      out.items[it.id] = { ...sums, qty, unit: CALCS[it.calc].unit || it.unit, unitPrice: qty ? sums.sell / qty : sums.sell, calcUnit: qty ? sums.calcSell / qty : sums.calcSell, margin: sums.sell ? (sums.sell - sums.cost) / sums.sell : 0, overridden: override != null, excluded: it.excluded, catExcluded: cat.excluded, autoWt, eff };
      if (it.excluded) { c.exSell += sums.sell; c.exCount++; }
      else { for (const k of SUMKEYS) c[k] += sums[k]; if (!cat.excluded) out.lineCount++; }
    }
    out.cats[cat.id] = c;
    if (!cat.excluded) for (const k of SUMKEYS) out.total[k] += c[k];
  }
  const keys = new Set<string>();
  for (const r of job.rates) {
    const key = r.key.trim().toLowerCase();
    if (!/^[a-z_][a-z0-9_]*$/.test(key) || key === "qty") out.errs[`${r.id}:key`] = "Use a rate key starting with a letter or underscore; qty is reserved";
    else if (keys.has(key)) out.errs[`${r.id}:key`] = "Duplicate rate key";
    keys.add(key);
    ev(r.id, "value", r.value);
  }
  if (Object.values(out.total).some(v => !Number.isFinite(v))) out.errs["job:total"] = "Calculated total is too large";
  out.margin = out.total.sell ? (out.total.sell - out.total.cost) / out.total.sell : 0;
  return out;
}
export function summarize(job: EstimateJob, c = computeJob(job)) {
  return { sell: c.total.sell, cost: c.total.cost, margin: c.margin, lineCount: c.lineCount, warnings: c.warnings,
    categories: job.categories.map(cat => ({ id: cat.id, name: cat.name, sell: cat.excluded ? 0 : c.cats[cat.id].sell, cost: cat.excluded ? 0 : c.cats[cat.id].cost })) };
}
export function refreshRates(job: EstimateJob, company: EstimateRates, options: { replaceDefaultMarkups?: boolean } = {}): EstimateJob {
  const match = <T extends { id: string; name: string }>(old: T[], fresh: T[]) => {
    const ids = new Map(old.map(row => [row.id, (fresh.find(n => n.id === row.id) ??
      fresh.find(n => n.name.trim().toLowerCase() === row.name.trim().toLowerCase()))?.id ?? row.id]));
    return { ids, rows: [...fresh, ...old.filter(row => !fresh.some(n => n.id === ids.get(row.id)))] };
  };
  const labor = match(job.laborRates, company.laborRates), equipment = match(job.equipRates, company.equipRates);
  return structuredClone({ ...job, defaults: options.replaceDefaultMarkups ? company.defaults : job.defaults,
    laborRates: labor.rows, equipRates: equipment.rows,
    categories: job.categories.map(cat => ({ ...cat, items: cat.items.map(line => ({ ...line, res: { ...line.res,
      lab: line.res.lab.map(row => ({ ...row, ltype: labor.ids.get(row.ltype) ?? row.ltype })),
      eq: line.res.eq.map(row => ({ ...row, etype: equipment.ids.get(row.etype) ?? row.etype })),
    } })) })),
    rates: [...company.rates, ...job.rates.filter(r => !company.rates.some(n => n.id === r.id || n.key.toLowerCase() === r.key.toLowerCase()))] });
}
