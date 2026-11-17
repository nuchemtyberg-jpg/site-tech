import { useLayoutEffect, useRef, useState } from "react";
import { makeResolver, type Totals } from "@shared/estimating/engine";
import { MARKUPS, money, type EstimateJob } from "@shared/estimating/model";

export function Field({ label, value, onChange, error, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; error?: string; placeholder?: string; type?: string }) {
  return <label className="estimate-field"><span>{label}</span><input aria-label={label} type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} aria-invalid={!!error} />{error && <span className="estimate-error" role="alert">{error}</span>}</label>;
}
export function WrappingInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const resize = () => { element.style.height = "auto"; element.style.height = `${element.scrollHeight}px`; };
    resize();
    let width = element.getBoundingClientRect().width, frame = 0;
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width;
      if (next === undefined || next === width) return;
      width = next;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(resize);
    });
    observer.observe(element);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [value]);
  return <textarea ref={ref} rows={1} aria-label={label} className="estimate-inline-text" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />;
}
export function Formula({ label, value, onChange, job, qty, placeholder }: { label: string; value: string; onChange: (v: string) => void; job: EstimateJob; qty?: number; placeholder?: string }) {
  const result = makeResolver(job).ev(value, qty === undefined ? undefined : { qty });
  return <div><Field label={label} value={value} onChange={onChange} error={result.err} placeholder={placeholder} />{!result.err && result.v != null && !/^\s*-?[\d,.]+\s*$/.test(value) && <span className="estimate-formula-result estimate-number">= {result.v.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>}</div>;
}
export function MarkupFields({ value, onChange, job, inherited }: { value: Record<typeof MARKUPS[number], string>; onChange: (key: typeof MARKUPS[number], v: string) => void; job: EstimateJob; inherited?: Record<typeof MARKUPS[number], string | number> }) {
  return <div className="estimate-grid">{MARKUPS.map(key => <Formula key={key} label={`${({ tax: "Tax", oh: "OH", ins: "Ins", profit: "Profit" })[key]} %`} value={value[key]} onChange={v => onChange(key, v)} job={job} placeholder={inherited ? `${inherited[key] || 0}%` : "0"} />)}</div>;
}
export function CompactTotals({ value, margin }: { value: Totals; margin: number }) {
  return <div className="estimate-compact-totals estimate-number"><span>Direct cost <strong>{money(value.cost)}</strong></span><span>Tax {money(value.tax)}</span><span>OH {money(value.oh)}</span><span>Ins {money(value.ins)}</span><span>Profit {money(value.profit)}</span><span>Sell <strong>{money(value.sell)}</strong></span><span>Margin {(margin * 100).toFixed(2)}%</span></div>;
}
export function TotalsStrip({ value, margin, excluded }: { value: Totals; margin?: number; excluded?: boolean }) {
  return <div className={`estimate-totals ${excluded ? "estimate-excluded" : ""}`}>{excluded && <small className="w-full">Excluded · would-be amounts</small>}{(["mat", "lab", "eq", "sub", "tax", "cost", "oh", "ins", "profit", "sell"] as const).map(key => <div key={key}><small>{{ mat: "Material", lab: "Labor", eq: "Equipment", sub: "Subcontract", tax: "Tax", cost: "Total cost", oh: "Overhead", ins: "Insurance", profit: "Profit", sell: "Sell" }[key]}</small><strong className={`estimate-number ${key === "sell" ? "text-primary" : ""}`}>{money(value[key])}</strong></div>)}{margin !== undefined && <div><small>Margin</small><strong className="estimate-number">{(margin * 100).toFixed(2)}%</strong></div>}</div>;
}
export function ManualPrice({ value, calculated, onChange, job, label = "Override unit price" }: { value: string; calculated: number; onChange: (v: string) => void; job: EstimateJob; label?: string }) {
  const [focused, setFocused] = useState(false);
  const result = makeResolver(job).ev(value);
  return <div className={`estimate-price ${value.trim() ? "estimate-manual" : ""}`}><label className="estimate-field"><span>{label}</span><input aria-label={label} value={!focused && result.v != null ? money(result.v) : value} placeholder={money(calculated)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={e => onChange(e.target.value)} aria-invalid={!!result.err} /></label>{value.trim() && <div className="estimate-manual-note">Manual price · calculated {money(calculated)} <button type="button" className="underline" aria-label={`Reset ${label} to calculated`} onClick={() => onChange("")}>↺</button></div>}{result.err && <p className="estimate-error" role="alert">{result.err}</p>}</div>;
}
