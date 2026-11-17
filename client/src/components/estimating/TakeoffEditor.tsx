import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Copy, GripVertical, MoreHorizontal, Trash2 } from "lucide-react";
import { computeJob } from "@shared/estimating/engine";
import { MARKUPS, newCategory, newId, newLine, money, type EstimateJob, type EstimateLine, type EstimateCategory } from "@shared/estimating/model";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CompactTotals, Field, ManualPrice, MarkupFields, TotalsStrip, WrappingInput } from "./EstimateFields";
import { LineEditor } from "./LineEditor";

function cloneLine(line: EstimateLine): EstimateLine {
  const result = structuredClone(line);
  result.id = newId();
  for (const rows of Object.values(result.res)) for (const row of rows) row.id = newId();
  return result;
}
export function TakeoffEditor({ job, onChange, focusLineId, focusCategoryId, focusSignal }: { job: EstimateJob; onChange: (job: EstimateJob) => void; focusLineId?: string; focusCategoryId?: string; focusSignal?: number }) {
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [openLines, setOpenLines] = useState<Set<string>>(new Set());
  useEffect(() => {
    const category = job.categories.find(c => c.items.some(line => line.id === focusLineId)) || job.categories.find(c => c.id === focusCategoryId);
    if (!category) return;
    setOpenCats(previous => new Set([...previous, category.id]));
    if (focusLineId) setOpenLines(previous => new Set([...previous, focusLineId]));
    const timer = window.setTimeout(() => {
      const target = document.getElementById(focusLineId && category.items.some(line => line.id === focusLineId) ? `takeoff-line-${focusLineId}` : `takeoff-category-${category.id}`);
      target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [focusLineId, focusCategoryId, focusSignal]);
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
  return <div className="space-y-3">
    <details className="estimate-panel"><summary className="estimate-section cursor-pointer font-semibold">Job information & cover options</summary><div className="p-3 space-y-3"><div className="estimate-grid">{(["name", "number", "client", "location", "bidDate", "preparedBy"] as const).map(key => <Field key={key} label={{ name: "Job name", number: "Job number", client: "Client", location: "Location", bidDate: "Bid date", preparedBy: "Prepared by" }[key]} value={job[key]} type={key === "bidDate" ? "date" : "text"} onChange={value => onChange({ ...job, [key]: value })} />)}</div><label className="estimate-field"><span>Notes, inclusions & exclusions</span><textarea rows={3} value={job.notes} onChange={e => onChange({ ...job, notes: e.target.value })} /></label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={job.coverShowTakeoff} onChange={e => onChange({ ...job, coverShowTakeoff: e.target.checked })} />Show takeoff quantities, units and unit prices on cover</label></div></details>
    <div className="flex flex-wrap justify-between items-center gap-2"><p className="text-xs text-muted-foreground">{job.categories.length} categories · {computed.lineCount} in-scope lines. Drag to reorder; category menus and expanded lines include keyboard move controls.</p><Button size="sm" variant="outline" onClick={() => {
      const cat = newCategory(); setOpenCats(new Set([...openCats, cat.id])); onChange({ ...job, categories: [...job.categories, cat] });
    }}>Add category</Button></div>
    {job.categories.length === 0 && <section className="estimate-panel p-10 text-center"><h3 className="font-semibold">Build the takeoff by work category</h3><p className="text-muted-foreground mt-2">Start with a category, then add measured lines and cost resources.</p></section>}
    {job.categories.map((cat, ci) => {
      const open = openCats.has(cat.id), totals = computed.cats[cat.id];
      const inherited = Object.fromEntries(MARKUPS.map(key => [key, cat[key].trim() ? cat[key] : job.defaults[key]])) as Record<typeof MARKUPS[number], string>;
      return <section key={cat.id} id={`takeoff-category-${cat.id}`} tabIndex={-1} className={`estimate-panel ${cat.excluded ? "estimate-excluded" : ""}`} aria-label={`Category ${ci + 1}: ${cat.name}`} onDragOver={e => e.preventDefault()} onDrop={e => {
        e.preventDefault(); e.stopPropagation();
        try { const data = JSON.parse(e.dataTransfer.getData("application/sitetech-estimate")); if (data.line) moveLine(data.cat, data.line, cat.id); else if (data.cat) moveCat(data.cat, ci); } catch { /* Non-estimate drag. */ }
      }}>
        <div className="estimate-category-head">
          <div className="estimate-category-title">
            <span draggable onDragStart={e => e.dataTransfer.setData("application/sitetech-estimate", JSON.stringify({ cat: cat.id }))} title="Drag category" className="estimate-icon cursor-grab"><GripVertical size={15} /></span>
            <button className="estimate-icon" aria-label={`${open ? "Collapse" : "Expand"} category ${cat.name}`} aria-expanded={open} onClick={() => setOpenCats(toggle(openCats, cat.id))}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
            <span className="estimate-badge">{ci + 1}</span>
            <WrappingInput label={`Category title ${ci + 1}`} value={cat.name} placeholder="Untitled category" onChange={name => patchCat({ ...cat, name })} />
          </div>
          <div className="estimate-inline-markups"><MarkupFields value={cat} job={job} inherited={job.defaults} onChange={(key, value) => patchCat({ ...cat, [key]: value })} /></div>
          <div className="text-right"><strong className="estimate-number">{money(totals.sell)}</strong><small className="block text-muted-foreground estimate-number">{(totals.sell ? (totals.sell - totals.cost) / totals.sell * 100 : 0).toFixed(2)}% margin · {cat.items.length} lines</small></div>
          <button className="estimate-scope" aria-label={`Exclude category ${cat.name}`} aria-pressed={cat.excluded} onClick={() => patchCat({ ...cat, excluded: !cat.excluded })}>{cat.excluded ? "Not included" : "In scope"}</button>
          <DropdownMenu><DropdownMenuTrigger asChild><button className="estimate-icon" aria-label={`Category actions ${cat.name}`}><MoreHorizontal size={18} /></button></DropdownMenuTrigger><DropdownMenuContent align="end">
            <DropdownMenuItem disabled={ci === 0} onSelect={() => moveCat(cat.id, ci - 1)}>Move category up</DropdownMenuItem>
            <DropdownMenuItem disabled={ci === job.categories.length - 1} onSelect={() => moveCat(cat.id, ci + 1)}>Move category down</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => {
              const copy = { ...structuredClone(cat), id: newId(), name: `${cat.name} (copy)`, items: cat.items.map(cloneLine) };
              const categories = [...job.categories]; categories.splice(ci + 1, 0, copy);
              setOpenCats(new Set([...openCats, copy.id])); setOpenLines(new Set([...openLines, ...copy.items.map(l => l.id)])); onChange({ ...job, categories });
            }}>Duplicate category</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onSelect={() => { if (window.confirm(`Delete "${cat.name}" and all its lines?`)) onChange({ ...job, categories: job.categories.filter(c => c.id !== cat.id) }); }}>Delete category</DropdownMenuItem>
          </DropdownMenuContent></DropdownMenu>
        </div>
        {open && <><div className="estimate-scroll estimate-takeoff-scroll"><div className="estimate-lines">
          <div className="estimate-line-grid estimate-line-head" aria-hidden="true"><span /><span>No.</span><span>Description</span><span>Size</span><span className="text-right">Qty / unit</span><span className="text-right">Unit price</span><span className="text-right">Total</span><span className="text-right">Margin</span><span>Scope</span><span /></div>
          {cat.items.map((line, li) => {
            const r = computed.items[line.id], expanded = openLines.has(line.id), number = `${ci + 1}.${li + 1}`;
            return <article key={line.id} id={`takeoff-line-${line.id}`} tabIndex={-1} className={`estimate-line ${expanded ? "estimate-line-open" : ""} ${line.excluded || cat.excluded ? "estimate-excluded" : ""}`} aria-label={`Line ${number}`} onDragOver={e => e.preventDefault()} onDrop={e => {
              e.preventDefault(); e.stopPropagation(); try { const data = JSON.parse(e.dataTransfer.getData("application/sitetech-estimate")); if (data.line) moveLine(data.cat, data.line, cat.id, line.id); } catch { /* Non-estimate drag. */ }
            }}>
              <div className="estimate-line-grid">
                <span draggable title="Drag line" className="estimate-icon cursor-grab" onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData("application/sitetech-estimate", JSON.stringify({ cat: cat.id, line: line.id })); }}><GripVertical size={13} /></span>
                <button aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} line ${number}: ${line.desc || "Untitled line"}`} className="flex items-center text-xs py-1" onClick={() => setOpenLines(toggle(openLines, line.id))}>{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<span className="estimate-number">{number}</span></button>
                <WrappingInput label={`Description ${number}`} value={line.desc} placeholder="Untitled line" onChange={desc => patchLine(cat, { ...line, desc })} />
                <div><span className="estimate-mobile-label">Size</span><WrappingInput label={`Size ${number}`} value={line.size} onChange={size => patchLine(cat, { ...line, size })} /></div>
                <div className="estimate-quantity estimate-number"><span className="estimate-mobile-label">Qty / unit</span>{r.qty.toLocaleString(undefined, { maximumFractionDigits: 3 })}<small>{r.unit || "—"}</small></div>
                <div><span className="estimate-mobile-label text-right">Unit price</span><ManualPrice label={`Unit price ${number}`} job={job} value={line.priceOverride} calculated={r.calcUnit} onChange={priceOverride => patchLine(cat, { ...line, priceOverride })} /></div>
                <strong className="estimate-number py-1"><span className="estimate-mobile-label">Total</span>{money(r.sell)}</strong>
                <span className="estimate-number py-1"><span className="estimate-mobile-label">Margin</span>{(r.margin * 100).toFixed(2)}%</span>
                <button className="estimate-scope" aria-label={`Exclude line ${number}`} aria-pressed={line.excluded} onClick={() => patchLine(cat, { ...line, excluded: !line.excluded })}>{line.excluded ? "Not included" : "In scope"}</button>
                <div className="flex"><button className="estimate-icon" title="Duplicate line" aria-label={`Duplicate line ${number}`} onClick={() => { const copy = cloneLine(line); const items = [...cat.items]; items.splice(li + 1, 0, copy); setOpenLines(new Set([...openLines, copy.id])); patchCat({ ...cat, items }); }}><Copy size={13} /></button><button className="estimate-icon" title="Delete line" aria-label={`Delete line ${number}`} onClick={() => { if (window.confirm("Delete this line and its costs?")) patchCat({ ...cat, items: cat.items.filter(l => l.id !== line.id) }); }}><Trash2 size={13} /></button></div>
              </div>
              {expanded && <LineEditor line={line} job={job} computed={computed} inherited={inherited} onChange={value => patchLine(cat, value)} moveControls={<>
                <select aria-label={`Move ${line.desc} to category`} value="" onChange={e => { if (e.target.value) moveLine(cat.id, line.id, e.target.value); }}><option value="">Move to category…</option>{job.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                <Button variant="ghost" size="sm" disabled={li === 0} onClick={() => moveLine(cat.id, line.id, cat.id, cat.items[li - 1].id)}>Up</Button>
                <Button variant="ghost" size="sm" disabled={li === cat.items.length - 1} onClick={() => moveLine(cat.id, line.id, cat.id, cat.items[li + 2]?.id)}>Down</Button>
              </>} />}
            </article>;
          })}
        </div></div><div className="p-2"><Button variant="outline" size="sm" onClick={() => { const line = newLine(); setOpenLines(new Set([...openLines, line.id])); patchCat({ ...cat, items: [...cat.items, line] }); }}>Add line</Button></div><CompactTotals value={totals} margin={totals.sell ? (totals.sell - totals.cost) / totals.sell : 0} />{totals.exCount > 0 && <p className="px-3 pb-2 text-xs text-muted-foreground">Excluded lines: {totals.exCount} · would-be sell {money(totals.exSell)} (not included above)</p>}</>}
      </section>;
    })}
    <div className="estimate-panel"><h3 className="px-3 pt-2 text-xs font-semibold">Estimate totals · in-scope only</h3><TotalsStrip value={computed.total} margin={computed.margin} /></div>
  </div>;
}
