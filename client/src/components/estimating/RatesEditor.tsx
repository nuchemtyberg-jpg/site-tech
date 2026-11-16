import { computeJob } from "@shared/estimating/engine";
import { emptyJob, newId, type EstimateJob, type EstimateRates } from "@shared/estimating/model";
import { Button } from "@/components/ui/button";
import { Field, Formula, MarkupFields } from "./EstimateFields";
import "./estimating.css";

export function RatesEditor({ rates, onChange }: { rates: EstimateRates; onChange: (rates: EstimateRates) => void }) {
  const job: EstimateJob = { ...emptyJob(), ...rates };
  const computed = computeJob(job);
  const sections = [
    { key: "rates", title: "Named formula rates", fields: ["key", "desc", "unit", "value"], labels: ["Key", "Description", "Unit", "Value / formula"] },
    { key: "laborRates", title: "Labor rates", fields: ["name", "hr", "day"], labels: ["Type name", "Hourly", "Daily"] },
    { key: "equipRates", title: "Equipment rates", fields: ["name", "hr", "day", "wk", "mo"], labels: ["Type name", "Hourly", "Daily", "Weekly", "Monthly"] },
  ] as const;
  return <div className="estimate-workspace space-y-4"><section className="estimate-panel p-3 space-y-3"><h3 className="font-semibold">Default markups</h3><MarkupFields job={job} value={rates.defaults} onChange={(key, value) => onChange({ ...rates, defaults: { ...rates.defaults, [key]: value } })} /></section><p className="text-xs text-muted-foreground">Formulas accept named keys, arithmetic and feet/inches. Leave periods blank to derive from the nearest filled period: 8 hr/day, 40 hr/week, 160 hr/month. Blank category and line markups inherit.</p>{sections.map(section => <section key={section.key} className="estimate-panel"><div className="estimate-section flex items-center justify-between"><h3 className="font-semibold">{section.title}</h3><Button type="button" variant="outline" size="sm" onClick={() => {
    const row = section.key === "rates" ? { id: newId(), key: "", desc: "", unit: "", value: "" } : section.key === "laborRates" ? { id: newId(), name: "", hr: "", day: "" } : { id: newId(), name: "", hr: "", day: "", wk: "", mo: "" };
    onChange({ ...rates, [section.key]: [...rates[section.key], row] });
  }}>Add rate</Button></div><div className="p-3 space-y-3">{rates[section.key].length === 0 && <p className="text-muted-foreground text-sm">No rates yet. Add a named type to reuse it in your estimate.</p>}{rates[section.key].map(row => <div key={row.id} className="border-b pb-3 last:border-0"><div className="estimate-grid">{section.fields.map((field, i) => {
    const value = (row as unknown as Record<string, string>)[field] || "";
    const update = (v: string) => onChange({ ...rates, [section.key]: rates[section.key].map(r => r.id === row.id ? { ...r, [field]: v } : r) });
    const derived = section.key === "rates" ? undefined : computed.tables[section.key === "laborRates" ? "lab" : "eq"][row.id]?.[field];
    return ["key", "desc", "unit", "name"].includes(field) ? <Field key={field} label={section.labels[i]} value={value} onChange={update} error={computed.errs[`${row.id}:${field}`]} /> : <Formula key={field} job={job} label={section.labels[i]} value={value} onChange={update} placeholder={derived == null ? "Not set" : `Derived ${derived.toFixed(2)}`} />;
  })}</div><Button type="button" size="sm" variant="ghost" className="mt-1 text-destructive" onClick={() => { if (window.confirm("Remove this rate? Referenced types may need a manual rate.")) onChange({ ...rates, [section.key]: rates[section.key].filter(r => r.id !== row.id) }); }}>Remove rate</Button></div>)}</div></section>)}</div>;
}
