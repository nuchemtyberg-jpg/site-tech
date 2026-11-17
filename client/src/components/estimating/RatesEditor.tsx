import { useState } from "react";
import { computeJob } from "@shared/estimating/engine";
import { emptyJob, MARKUPS, newId, type EstimateJob, type EstimateRates } from "@shared/estimating/model";
import { Button } from "@/components/ui/button";
import { Field, Formula } from "./EstimateFields";
import "./estimating.css";
import "./rate-management.css";

const markupLabels = { tax: "Material tax", oh: "Overhead", ins: "Insurance", profit: "Profit" };
export function RatesEditor({ rates, onChange, readOnly = false }: { rates: EstimateRates; onChange: (rates: EstimateRates) => void; readOnly?: boolean }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [editingCategory, setEditingCategory] = useState<{ id: string; category: string }>();
  const job: EstimateJob = { ...emptyJob(), ...rates };
  const computed = computeJob(job);
  const categoryName = (value?: string) => value?.trim() || "Uncategorized";
  // Keep the focused row in its original group until blur, while committing
  // every keystroke to the parent draft for save/navigation protection.
  const groupName = (row: EstimateRates["rates"][number]) => categoryName(editingCategory?.id === row.id ? editingCategory.category : row.category);
  const categories = [...new Set(rates.rates.map(groupName))].sort((a, b) => a === b ? 0 : a === "Uncategorized" ? 1 : b === "Uncategorized" ? -1 : a.localeCompare(b, undefined, { sensitivity: "base" }));
  const term = search.trim().toLocaleLowerCase();
  const materialRows = rates.rates.filter(row => (!category || groupName(row) === category) && (!term || [row.key, row.desc, row.unit, row.category, row.notes].some(value => value?.toLocaleLowerCase().includes(term))));
  const sections = [
    { key: "laborRates", title: "Labor rates", fields: ["name", "hr", "day", "notes"], labels: ["Type name", "Hourly", "Daily", "Notes"] },
    { key: "equipRates", title: "Equipment rates", fields: ["name", "hr", "day", "wk", "mo", "notes"], labels: ["Type name", "Hourly", "Daily", "Weekly", "Monthly", "Notes"] },
  ] as const;
  const remove = (section: "rates" | "laborRates" | "equipRates", id: string) => {
    if (window.confirm("Remove this rate? Referenced types may need a manual rate.")) onChange({ ...rates, [section]: rates[section].filter(row => row.id !== id) });
  };
  return <div className="estimate-workspace rate-editor space-y-4">
    <section className="estimate-panel p-3 space-y-3"><h3 className="font-semibold">Default markups</h3><fieldset disabled={readOnly} className="rate-markups">{MARKUPS.map(key => <div key={key}><Formula job={job} label={`${markupLabels[key]} %`} value={rates.defaults[key] || ""} onChange={value => onChange({ ...rates, defaults: { ...rates.defaults, [key]: value } })} placeholder="0" /><Field label={`${markupLabels[key]} notes`} value={rates.markupNotes?.[key] || ""} onChange={value => onChange({ ...rates, markupNotes: { tax: "", oh: "", ins: "", profit: "", ...rates.markupNotes, [key]: value } })} /></div>)}</fieldset></section>
    <p className="text-xs text-muted-foreground">Formulas accept named keys, arithmetic and feet/inches. Leave periods blank to derive from the nearest filled period: 8 hr/day, 40 hr/week, 160 hr/month. Blank category and line markups inherit.</p>
    <section className="estimate-panel">
      <div className="estimate-section flex flex-wrap gap-2 items-center justify-between"><div><h3 className="font-semibold">Named formula rates</h3><p className="text-xs text-muted-foreground">Materials · {materialRows.length} of {rates.rates.length} rates</p></div>{!readOnly && <Button type="button" variant="outline" size="sm" onClick={() => { setSearch(""); setCategory(""); onChange({ ...rates, rates: [...rates.rates, { id: newId(), key: "", desc: "", unit: "", value: "", category: category === "Uncategorized" ? "" : category, notes: "" }] }); }}>Add material rate</Button>}</div>
      <div className="rate-filters"><Field label="Search material rates" value={search} onChange={setSearch} placeholder="Key, description, unit, category or notes" /><label className="estimate-field"><span>Material category</span><select aria-label="Material category" value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label></div>
      {materialRows.length === 0 && <div className="p-5 space-y-2"><p className="font-medium">{rates.rates.length ? "No matching material rates" : "No material rates yet"}</p><p className="text-xs text-muted-foreground">{rates.rates.length ? "Try a different category or search term." : "Add a named rate to reuse its key in estimate formulas."}</p>{(search || category) && <Button size="sm" variant="outline" onClick={() => { setSearch(""); setCategory(""); }}>Clear filters</Button>}</div>}
      {categories.map(group => {
        const rows = materialRows.filter(row => groupName(row) === group).sort((a, b) => (a.key || a.desc).localeCompare(b.key || b.desc, undefined, { sensitivity: "base" }));
        if (!rows.length) return null;
        return <details className="rate-group" key={group} open><summary>{group}<span className="rate-group-count">{rows.length} {rows.length === 1 ? "rate" : "rates"}</span></summary>{rows.map(row => <fieldset disabled={readOnly} className="rate-row" key={row.id}>{(["key", "desc", "unit", "value", "category", "notes"] as const).map((field, i) => {
          const label = ["Key", "Description", "Unit", "Value / formula", "Category", "Source / notes"][i];
          const update = (value: string) => onChange({ ...rates, rates: rates.rates.map(item => item.id === row.id ? { ...item, [field]: value } : item) });
          return field === "value" ? <div key={field}><Formula job={job} label={label} value={row.value || ""} onChange={update} placeholder="Not priced" />{!row.value?.trim() && <p className="rate-no-price">No price set</p>}</div> : field === "category" ? <div key={field} onFocus={() => setEditingCategory({ id: row.id, category: row.category || "" })} onBlur={() => setEditingCategory(undefined)}><Field label={label} value={row.category || ""} onChange={update} placeholder="Uncategorized" /></div> : <Field key={field} label={label} value={row[field] || ""} onChange={update} error={computed.errs[`${row.id}:${field}`]} />;
        })}{!readOnly && <Button type="button" size="sm" variant="ghost" className="rate-remove text-destructive" aria-label={`Remove ${row.key || row.desc || "material rate"}`} onClick={() => remove("rates", row.id)}>Remove</Button>}</fieldset>)}</details>;
      })}
    </section>
    {sections.map(section => <section key={section.key} className="estimate-panel"><div className="estimate-section flex items-center justify-between gap-2"><h3 className="font-semibold">{section.title} <span className="text-xs text-muted-foreground font-normal">· {rates[section.key].length}</span></h3>{!readOnly && <Button type="button" variant="outline" size="sm" onClick={() => {
      const row = section.key === "laborRates" ? { id: newId(), name: "", hr: "", day: "", notes: "" } : { id: newId(), name: "", hr: "", day: "", wk: "", mo: "", notes: "" };
      onChange({ ...rates, [section.key]: [...rates[section.key], row] });
    }}>Add rate</Button>}</div>{rates[section.key].length === 0 && <p className="text-muted-foreground text-sm p-4">No rates yet. Add a named type to reuse it in your estimate.</p>}{[...rates[section.key]].sort((a, b) => a.name.localeCompare(b.name)).map(row => <fieldset disabled={readOnly} key={row.id} className={`rate-row ${section.key === "laborRates" ? "rate-row-labor" : "rate-row-equipment"}`}>{section.fields.map((field, i) => {
      const value = (row as unknown as Record<string, string>)[field] || "";
      const update = (v: string) => onChange({ ...rates, [section.key]: rates[section.key].map(r => r.id === row.id ? { ...r, [field]: v } : r) });
      const derived = computed.tables[section.key === "laborRates" ? "lab" : "eq"][row.id]?.[field];
      return field === "name" || field === "notes" ? <Field key={field} label={section.labels[i]} value={value} onChange={update} error={computed.errs[`${row.id}:${field}`]} /> : <Formula key={field} job={job} label={section.labels[i]} value={value} onChange={update} placeholder={derived == null ? "Not set" : `Derived ${derived.toFixed(2)}`} />;
    })}{!readOnly && <Button type="button" size="sm" variant="ghost" className="rate-remove text-destructive" aria-label={`Remove ${row.name || "rate"}`} onClick={() => remove(section.key, row.id)}>Remove</Button>}</fieldset>)}</section>)}
  </div>;
}

