import { useState } from "react";
import { makeResolver, type Totals } from "@shared/estimating/engine";
import { MARKUPS, money, type EstimateJob } from "@shared/estimating/model";

export function Field({ label, value, onChange, error, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; error?: string; placeholder?: string; type?: string }) {
  return <label className="estimate-field"><span>{label}</span><input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} aria-invalid={!!error} />{error && <span className="estimate-error" role="alert">{error}</span>}</label>;
}
export function Formula({ label, value, onChange, job, qty, placeholder }: { label: string; value: string; onChange: (v: string) => void; job: EstimateJob; qty?: number; placeholder?: string }) {
  const result = makeResolver(job).ev(value, qty === undefined ? undefined : { qty });
  return <div><Field label={label} value={value} onChange={onChange} error={result.err} placeholder={placeholder} />{!result.err && result.v != null && <span className="text-[10px] text-muted-foreground estimate-number">= {result.v.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>}</div>;
}
export function MarkupFields({ value, onChange, job, inherited }: { value: Record<typeof MARKUPS[number], string>; onChange: (key: typeof MARKUPS[number], v: string) => void; job: EstimateJob; inherited?: Record<typeof MARKUPS[number], string | number> }) {
  return <div className="estimate-grid">{MARKUPS.map(key => <Formula key={key} label={`${({ tax: "Material tax", oh: "Overhead", ins: "Insurance", profit: "Profit markup" })[key]} %`} value={value[key]} onChange={v => onChange(key, v)} job={job} placeholder={inherited ? `Inherit ${inherited[key] || 0}%` : "0"} />)}</div>;
}
export function TotalsStrip({ value, margin, excluded }: { value: Totals; margin?: number; excluded?: boolean }) {
  return <div className={`estimate-totals ${excluded ? "estimate-excluded" : ""}`}>{excluded && <small className="w-full">Excluded · would-be amounts</small>}{(["mat", "lab", "eq", "sub", "tax", "cost", "oh", "ins", "profit", "sell"] as const).map(key => <div key={key}><small>{{ mat: "Material", lab: "Labor", eq: "Equipment", sub: "Subcontract", tax: "Tax", cost: "Total cost", oh: "Overhead", ins: "Insurance", profit: "Profit", sell: "Sell" }[key]}</small><strong className={`estimate-number ${key === "sell" ? "text-primary" : ""}`}>{money(value[key])}</strong></div>)}{margin !== undefined && <div><small>Margin</small><strong className="estimate-number">{(margin * 100).toFixed(2)}%</strong></div>}</div>;
}
export function ManualPrice({ value, calculated, onChange, job }: { value: string; calculated: number; onChange: (v: string) => void; job: EstimateJob }) {
  const [focused, setFocused] = useState(false);
  const result = makeResolver(job).ev(value);
  return <div className="space-y-1"><label className="estimate-field"><span className={value.trim() ? "text-destructive font-semibold" : ""}>{value.trim() ? "Manual price / unit" : "Override unit price"}</span><input value={!focused && result.v != null ? money(result.v) : value} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={e => onChange(e.target.value)} aria-invalid={!!result.err} /></label><div className={`text-xs ${value.trim() ? "text-destructive font-medium" : "text-muted-foreground"}`}>{value.trim() ? `Manual price · calculated ${money(calculated)}` : `Calculated ${money(calculated)}`} {value.trim() && <button type="button" className="text-primary underline ml-2" onClick={() => onChange("")}>Reset to calculated</button>}</div>{result.err && <p className="estimate-error">{result.err}</p>}</div>;
}
