import { type EstimateRates } from "./model";
export const blank = (value: unknown) => value == null || String(value).trim() === "";

/** Small arithmetic parser: no eval/Function, property access, or executable JS. */
export function evaluate(source: string, lookup: (key: string) => number): number | null {
  let s = source.trim().replace(/^=/, "").replace(/[,$%]/g, "").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/\[/g, "(").replace(/\]/g, ")");
  s = s.replace(/(\d+(?:\.\d+)?)\s*'\s*-?\s*(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?\s*"/g, (_, f, i, a, b) => `(${f}+(${i}${a ? `+${a}/${b}` : ""})/12)`)
    .replace(/(\d+(?:\.\d+)?)\s*'/g, "($1)")
    .replace(/(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?\s*"/g, (_, i, a, b) => `((${i}${a ? `+${a}/${b}` : ""})/12)`);
  if (!s.trim()) return null;
  if (s.length > 2000) throw new Error("Formula is too long");
  const tokens = s.match(/\d*\.?\d+|[A-Za-z_][A-Za-z0-9_]*|[^\s]/g) || [];
  let p = 0, depth = 0;
  const peek = () => tokens[p];
  const prim = (): number => {
    if (++depth > 80) throw new Error("Formula is too deeply nested");
    const t = tokens[p++]; let v: number;
    if (t === "(") { v = sum(); if (tokens[p++] !== ")") throw new Error("Missing )"); }
    else if (/^(?:\d*\.?\d+)$/.test(t || "")) v = Number(t);
    else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t || "")) v = lookup(t);
    else throw new Error(t ? `Unexpected "${t}"` : "Formula is incomplete");
    depth--; return v;
  };
  const unary = (): number => {
    if (peek() === "-" || peek() === "+") { const t = tokens[p++]; if (++depth > 80) throw new Error("Formula is too deeply nested"); const v = unary(); depth--; return t === "-" ? -v : v; }
    return prim();
  };
  const pow = (): number => { const a = unary(); if (peek() !== "^") return a; p++; if (++depth > 80) throw new Error("Formula is too deeply nested"); const b = pow(); depth--; return Math.pow(a, b); };
  const product = (): number => { let a = pow(); while (peek() === "*" || peek() === "/") { const op = tokens[p++], b = pow(); if (op === "/" && b === 0) throw new Error("Divides by zero"); a = op === "*" ? a * b : a / b; } return a; };
  const sum = (): number => { let a = product(); while (peek() === "+" || peek() === "-") { const op = tokens[p++], b = product(); a = op === "+" ? a + b : a - b; } return a; };
  const value = sum();
  if (p !== tokens.length) throw new Error(`Unexpected "${tokens[p]}"`);
  if (!Number.isFinite(value)) throw new Error("Result is not finite");
  return value;
}

export function makeResolver(job: Pick<EstimateRates, "rates">) {
  const cache = new Map<string, number>(), visiting = new Set<string>();
  const map = new Map(job.rates.map(r => [r.key.trim().toLowerCase(), r]));
  const get = (name: string): number => {
    const key = name.toLowerCase();
    if (key === "qty") throw new Error('"qty" only works inside a line');
    if (cache.has(key)) return cache.get(key)!;
    const row = map.get(key);
    if (!row) throw new Error(`No rate named "${name}"`);
    if (visiting.has(key)) throw new Error(`Rate "${name}" refers back to itself`);
    if (visiting.size > 80) throw new Error("Rate chain is too deep");
    visiting.add(key);
    try { const v = evaluate(row.value, get) ?? 0; cache.set(key, v); return v; } finally { visiting.delete(key); }
  };
  return {
    get,
    ev: (value: string, ctx?: { qty: number }): { v: number | null; err?: string } => {
      try { return { v: evaluate(value || "", key => key.toLowerCase() === "qty" && ctx ? ctx.qty : get(key)) }; }
      catch (e) { return { v: null, err: (e as Error).message }; }
    },
  };
}

function fraction(value: string) {
  const parts = value.trim().split(/\s+/);
  const one = (s: string) => s.includes("/") ? Number(s.split("/")[0]) / Number(s.split("/")[1]) : Number(s);
  return parts.reduce((sum, v) => sum + one(v), 0);
}
export function sizeWeight(size: string): number | null {
  let s = size.trim().toUpperCase().replace(/×/g, "X"), mult = 1, m;
  if ((m = s.match(/^\((\d+)\)\s*/)) || (m = s.match(/^(\d+)\s*-\s*(?=[A-Z])/))) { mult = +m[1]; s = s.slice(m[0].length); }
  if ((m = s.match(/^(W|HP|M|S|C|MC|WT|ST)\s*(\d+(?:\.\d+)?)\s*X\s*(\d+(?:\.\d+)?)/))) return mult * +m[3];
  if ((m = s.match(/^(?:PIPE|PP)\s*(\d+(?:\.\d+)?)\s*(?:"|IN)?\s*X\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)/))) {
    const D = +m[1], t = fraction(m[2]); if (t > 0 && t < D / 2) return mult * 10.69 * (D - t) * t;
  }
  if ((m = s.match(/^(?:PLATE|PL)\s*(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)\s*(?:"|IN)?\s*X\s*(\d+(?:\.\d+)?)/))) return mult * 3.4 * fraction(m[1]) * +m[2];
  return null;
}
