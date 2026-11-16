import { useState } from "react";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { computeJob } from "@shared/estimating/engine";
import { MARKUPS, newCategory, newId, newLine, money, type EstimateJob, type EstimateLine, type EstimateCategory } from "@shared/estimating/model";
import { Button } from "@/components/ui/button";
import { Field, MarkupFields, TotalsStrip } from "./EstimateFields";
import { LineEditor } from "./LineEditor";

function cloneLine(line: EstimateLine): EstimateLine {
  const result = structuredClone(line);
  result.id = newId();
  for (const rows of Object.values(result.res)) for (const row of rows) row.id = newId();
  return result;
}
export function TakeoffEditor({ job, onChange }: { job: EstimateJob; onChange: (job: EstimateJob) => void }) {
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [openLines, setOpenLines] = useState<Set<string>>(new Set());
  const computed = computeJob(job);
  const toggle = (set: Set<string>, id: string) => { const next = new Set(set); next.has(id) ? next.delete(id) : next.add(id); return next; };
  const patchCat = (cat: EstimateCategory) => onChange({ ...job, categories: job.categories.map(c => c.id === cat.id ? cat : c) });
  const patchLine = (cat: EstimateCategory, line: EstimateLine) => patchCat({ ...cat, items: cat.items.map(l => l.id === line.id ? line : l) });
  const moveCat = (id: string, destination: number) => {
    const categories = [...job.categories], from = categories.findIndex(c => c.id === id);
    if (from < 0 || destination < 0 || destination >= categories.length) return;
    const [cat] = categories.splice(from, 1); categories.splice(destination, 0, cat); onChange({ ...job, categories });
  };
  const moveLine = (from: string, id: string, to: string, before?: string) => {
    const line = job.categories.find(c => c.id === from)?.items.find(l => l.id === id);
    if (!line || id === before) return;
    const categories = job.categories.map(c => ({ ...c, items: c.items.filter(l => l.id !== id) }));
    const target = categories.find(c => c.id === to);
    if (!target) return;
    const index = before ? target.items.findIndex(l => l.id === before) : target.items.length;
    target.items.splice(Math.max(0, index), 0, line);
    setOpenCats(previous => new Set([...previous, to]));
    onChange({ ...job, categories });
  };
  return <div className="space-y-3"><details className="estimate-panel"><summary className="estimate-section cursor-pointer font-semibold">Job information & cover options</summary><div className="p-3 space-y-3"><div className="estimate-grid">{(["name", "number", "client", "location", "bidDate", "preparedBy"] as const).map(key => <Field key={key} label={{ name: "Job name", number: "Job number", client: "Client", location: "Location", bidDate: "Bid date", preparedBy: "Prepared by" }[key]} value={job[key]} type={key === "bidDate" ? "date" : "text"} onChange={value => onChange({ ...job, [key]: value })} />)}</div><label className="estimate-field"><span>Notes, inclusions & exclusions</span><textarea rows={3} value={job.notes} onChange={e => onChange({ ...job, notes: e.target.value })} /></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={job.coverShowTakeoff} onChange={e => onChange({ ...job, coverShowTakeoff: e.target.checked })} />Show takeoff quantities, units and unit prices on cover</label></div></details>
    <div className="flex flex-wrap justify-between items-center gap-2"><p className="text-xs text-muted-foreground">{job.categories.length} categories · {computed.lineCount} in-scope lines. Drag handles to reorder; use move menus with a keyboard.</p><Button size="sm" variant="outline" onClick={() => {
      const cat = newCategory(); setOpenCats(new Set([...openCats, cat.id])); onChange({ ...job, categories: [...job.categories, cat] });
    }}>Add category</Button></div>
    {job.categories.length === 0 && <section className="estimate-panel p-10 text-center"><h3 className="font-semibold">Build the takeoff by work category</h3><p className="text-muted-foreground mt-2">Start with a category, then add measured lines and cost resources.</p></section>}
    {job.categories.map((cat, ci) => {
      const open = openCats.has(cat.id), totals = computed.cats[cat.id];
      const inherited = Object.fromEntries(MARKUPS.map(key => [key, cat[key].trim() ? cat[key] : job.defaults[key]])) as Record<typeof MARKUPS[number], string>;
      return <section key={cat.id} className={`estimate-panel ${cat.excluded ? "estimate-excluded" : ""}`} onDragOver={e => e.preventDefault()} onDrop={e => {
        e.preventDefault(); e.stopPropagation();
        try { const data = JSON.parse(e.dataTransfer.getData("application/sitetech-estimate")); if (data.line) moveLine(data.cat, data.line, cat.id); else if (data.cat) moveCat(data.cat, ci); } catch { /* Non-estimate drag. */ }
      }}><div className="estimate-section flex flex-wrap items-start gap-2"><span draggable onDragStart={e => e.dataTransfer.setData("application/sitetech-estimate", JSON.stringify({ cat: cat.id }))} title="Drag category" className="cursor-grab py-2"><GripVertical size={16} /></span><button className="flex flex-1 min-w-40 items-start gap-2 text-left font-semibold whitespace-pre-wrap break-words" aria-expanded={open} onClick={() => setOpenCats(toggle(openCats, cat.id))}>{open ? <ChevronDown size={16} className="shrink-0 mt-0.5" /> : <ChevronRight size={16} className="shrink-0 mt-0.5" />}<span>{ci + 1}. {cat.name || "Untitled category"}<small className="block text-muted-foreground font-normal">{cat.items.length} lines{cat.excluded ? " · Excluded" : ""}</small></span></button><strong className="estimate-number">{money(totals.sell)}</strong><label className="text-xs flex items-center gap-1"><input type="checkbox" checked={cat.excluded} onChange={e => patchCat({ ...cat, excluded: e.target.checked })} />Exclude</label><select aria-label={`Move category ${cat.name}`} className="!w-auto max-w-40" value="" onChange={e => { if (e.target.value !== "") moveCat(cat.id, Number(e.target.value)); }}><option value="">Move category…</option>{job.categories.map((c, i) => <option key={c.id} value={i}>Position {i + 1} · {c.name}</option>)}</select><Button variant="ghost" size="sm" disabled={ci === 0} onClick={() => moveCat(cat.id, ci - 1)}>Up</Button><Button variant="ghost" size="sm" disabled={ci === job.categories.length - 1} onClick={() => moveCat(cat.id, ci + 1)}>Down</Button><Button variant="ghost" size="sm" onClick={() => {
        const copy = { ...structuredClone(cat), id: newId(), name: `${cat.name} (copy)`, items: cat.items.map(cloneLine) };
        const categories = [...job.categories]; categories.splice(ci + 1, 0, copy); setOpenCats(new Set([...openCats, copy.id])); setOpenLines(new Set([...openLines, ...copy.items.map(l => l.id)])); onChange({ ...job, categories });
      }}>Duplicate</Button><Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (window.confirm(`Delete "${cat.name}" and all its lines?`)) onChange({ ...job, categories: job.categories.filter(c => c.id !== cat.id) }); }}>Delete</Button></div>
      {open && <><div className="p-3 space-y-3"><label className="estimate-field"><span>Category title</span><textarea value={cat.name} onChange={e => patchCat({ ...cat, name: e.target.value })} /></label><MarkupFields value={cat} job={job} inherited={job.defaults} onChange={(key, value) => patchCat({ ...cat, [key]: value })} /></div>
      {cat.items.map((line, li) => {
        const r = computed.items[line.id], expanded = openLines.has(line.id);
        return <article key={line.id} className={`border-t ${line.excluded || cat.excluded ? "estimate-excluded" : ""}`} onDragOver={e => e.preventDefault()} onDrop={e => {
          e.preventDefault(); e.stopPropagation(); try { const data = JSON.parse(e.dataTransfer.getData("application/sitetech-estimate")); if (data.line) moveLine(data.cat, data.line, cat.id, line.id); } catch { /* Non-estimate drag. */ }
        }}><div className="estimate-summary"><span className="flex items-center gap-1"><span draggable title="Drag line" className="cursor-grab" onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("application/sitetech-estimate", JSON.stringify({ cat: cat.id, line: line.id })); }}><GripVertical size={13} /></span><span>{li + 1}</span></span><button aria-expanded={expanded} className="estimate-description text-left flex items-start gap-1 whitespace-pre-wrap break-words" onClick={() => setOpenLines(toggle(openLines, line.id))}>{expanded ? <ChevronDown size={14} className="shrink-0 mt-1" /> : <ChevronRight size={14} className="shrink-0 mt-1" />}<span className="font-medium">{line.desc || "Untitled line"}{r.overridden && <small className="block text-destructive">Manual price</small>}</span></button><div><small className="block text-muted-foreground">Quantity</small><span className="estimate-number">{r.qty.toLocaleString(undefined, { maximumFractionDigits: 3 })}</span></div><div><small className="block text-muted-foreground">Unit</small>{r.unit || "—"}</div><div><small className="block text-muted-foreground">Unit price</small><span className="estimate-number">{money(r.unitPrice)}</span></div><div><small className="block text-muted-foreground">Sell</small><strong className="estimate-number">{money(r.sell)}</strong></div><div><small className="block text-muted-foreground">Margin</small><span className="estimate-number">{(r.margin * 100).toFixed(2)}%</span></div></div><div className="px-3 pb-2 flex flex-wrap items-center gap-2"><label className="text-xs flex items-center gap-1"><input type="checkbox" checked={line.excluded} onChange={e => patchLine(cat, { ...line, excluded: e.target.checked })} />Exclude</label><select className="!w-auto max-w-48" aria-label={`Move ${line.desc} to category`} value="" onChange={e => { if (e.target.value) moveLine(cat.id, line.id, e.target.value); }}><option value="">Move to category…</option>{job.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><Button variant="ghost" size="sm" disabled={li === 0} onClick={() => moveLine(cat.id, line.id, cat.id, cat.items[li - 1].id)}>Up</Button><Button variant="ghost" size="sm" disabled={li === cat.items.length - 1} onClick={() => moveLine(cat.id, line.id, cat.id, cat.items[li + 2]?.id)}>Down</Button><Button size="sm" variant="ghost" onClick={() => { const copy = cloneLine(line); const items = [...cat.items]; items.splice(li + 1, 0, copy); setOpenLines(new Set([...openLines, copy.id])); patchCat({ ...cat, items }); }}>Duplicate line</Button><Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (window.confirm("Delete this line and its costs?")) patchCat({ ...cat, items: cat.items.filter(l => l.id !== line.id) }); }}>Delete line</Button></div>{expanded && <LineEditor line={line} job={job} computed={computed} inherited={inherited} onChange={value => patchLine(cat, value)} />}</article>;
      })}<div className="p-3"><Button variant="outline" size="sm" onClick={() => { const line = newLine(); setOpenLines(new Set([...openLines, line.id])); patchCat({ ...cat, items: [...cat.items, line] }); }}>Add line</Button></div><TotalsStrip value={totals} margin={totals.sell ? (totals.sell - totals.cost) / totals.sell : 0} excluded={cat.excluded} />{totals.exCount > 0 && <p className="p-3 text-xs text-muted-foreground">Excluded lines: {totals.exCount} · would-be sell {money(totals.exSell)} (not included above)</p>}</>}
      </section>;
    })}
    <div className="estimate-panel"><h3 className="px-3 pt-3 text-sm font-semibold">Estimate totals · in-scope only</h3><TotalsStrip value={computed.total} margin={computed.margin} /></div>
  </div>;
}
