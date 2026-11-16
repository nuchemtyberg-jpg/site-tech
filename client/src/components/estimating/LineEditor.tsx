import { CALCS, newId, money, type CalcType, type EstimateJob, type EstimateLine } from "@shared/estimating/model";
import { type Computation } from "@shared/estimating/engine";
import { Button } from "@/components/ui/button";
import { Field, Formula, ManualPrice, MarkupFields, TotalsStrip } from "./EstimateFields";

type DimensionsValue = Pick<EstimateLine, "calc" | "n" | "l" | "w" | "d" | "wt" | "qty" | "unit">;
export function Dimensions({ value, onChange, job, qty, autoWt }: { value: DimensionsValue; onChange: (patch: Partial<DimensionsValue>) => void; job: EstimateJob; qty?: number; autoWt?: number | null }) {
  const labels: Record<string, string> = { n: "Count", l: "Length · ft", w: "Width · ft", d: "Depth · ft", wt: "Weight · lb/ft", qty: "Quantity" };
  return <div className="estimate-grid"><label className="estimate-field"><span>Calculator</span><select value={value.calc} onChange={e => onChange({ calc: e.target.value as CalcType })}>{Object.entries(CALCS).map(([key, calc]) => <option key={key} value={key}>{calc.label}</option>)}</select></label>{CALCS[value.calc].fields.map(field => <Formula key={field} label={labels[field]} value={value[field]} job={job} qty={qty} onChange={v => onChange({ [field]: v })} placeholder={field === "wt" && autoWt != null ? `Steel auto ${autoWt.toFixed(3)}` : undefined} />)}{value.calc === "qty" && <Field label="Unit" value={value.unit} onChange={unit => onChange({ unit })} />}{autoWt != null && ["lbs", "tons"].includes(value.calc) && <p className="text-xs text-muted-foreground self-center">Steel auto-weight: {autoWt.toFixed(3)} lb/ft. Enter weight to override.</p>}</div>;
}

export function LineEditor({ line, job, computed, onChange, inherited }: { line: EstimateLine; job: EstimateJob; computed: Computation; onChange: (line: EstimateLine) => void; inherited: Record<"tax" | "oh" | "ins" | "profit", string | number> }) {
  const result = computed.items[line.id];
  const patch = (change: Partial<EstimateLine>) => onChange({ ...line, ...change });
  const kinds = ["mat", "lab", "eq", "sub"] as const;
  return <div className="border-t p-3 space-y-4">
    <div className="estimate-grid"><label className="estimate-field"><span>Description</span><textarea value={line.desc} onChange={e => patch({ desc: e.target.value })} /></label><Field label="Size / steel section" value={line.size} onChange={size => patch({ size })} /><Field label="Drawing reference" value={line.ref} onChange={ref => patch({ ref })} /><Field label="Flag / note" value={line.flag} onChange={flag => patch({ flag })} /></div>
    <Dimensions job={job} value={line} onChange={patch} autoWt={result.autoWt} />
    <div className="text-xs text-muted-foreground">Takeoff <strong className="estimate-number">{result.qty.toLocaleString(undefined, { maximumFractionDigits: 4 })} {result.unit}</strong>. Resource formulas may reference <code>qty</code> for this takeoff quantity.</div>
    {kinds.map(kind => {
      const rows = line.res[kind];
      const update = (id: string, change: Record<string, string>) => patch({ res: { ...line.res, [kind]: rows.map(row => row.id === id ? { ...row, ...change } : row) } });
      return <section key={kind} className="estimate-panel"><div className="estimate-section flex justify-between items-center"><h4 className="font-semibold">{{ mat: "Material", lab: "Labor", eq: "Equipment", sub: "Subcontract / other" }[kind]}</h4><Button variant="outline" size="sm" onClick={() => {
        const base = { id: newId(), desc: "" };
        const row = kind === "mat" ? { ...base, calc: "qty", n: "", l: "", w: "", d: "", wt: "", qty: "", unit: "", waste: "", cost: "" } : kind === "sub" ? { ...base, qty: "", unit: "", cost: "" } : { ...base, ltype: "", etype: "", crew: "1", dur: "", basis: "day", rate: "" };
        patch({ res: { ...line.res, [kind]: [...rows, row] } } as Partial<EstimateLine>);
      }}>Add row</Button></div><div className="divide-y">{rows.length === 0 && <p className="px-3 py-4 text-xs text-muted-foreground">No {kind === "mat" ? "material" : kind === "lab" ? "labor" : kind === "eq" ? "equipment" : "subcontract"} costs. Add as many rows as needed.</p>}{rows.map(row => {
        const values = row as unknown as Record<string, string>;
        const cost = computed.res[row.id];
        const typed = kind === "lab" || kind === "eq";
        const options = kind === "lab" ? job.laborRates : job.equipRates;
        const typeField = kind === "lab" ? "ltype" : "etype";
        const input = (field: string, label: string, placeholder?: string) => <Formula key={field} label={label} value={values[field] || ""} onChange={v => update(row.id, { [field]: v })} job={job} qty={result.qty} placeholder={placeholder} />;
        return <div key={row.id} className="p-3 space-y-2"><div className="estimate-grid"><label className="estimate-field"><span>Description</span><textarea value={row.desc} onChange={e => update(row.id, { desc: e.target.value })} /></label>{typed ? <><label className="estimate-field"><span>{kind === "lab" ? "Labor type" : "Equipment type"}</span><select value={values[typeField]} onChange={e => update(row.id, { [typeField]: e.target.value })}><option value="">Manual · no type</option>{values[typeField] && !options.some(r => r.id === values[typeField]) && <option value={values[typeField]}>Missing imported type</option>}{options.map(rate => <option key={rate.id} value={rate.id}>{rate.name || "Unnamed type"}</option>)}</select></label>{input("crew", kind === "lab" ? "Crew count" : "Equipment count", "1")}{input("dur", "Duration")}<label className="estimate-field"><span>Period</span><select value={values.basis || "day"} onChange={e => update(row.id, { basis: e.target.value })}>{(kind === "lab" ? ["hr", "day"] : ["hr", "day", "wk", "mo"]).map(period => <option key={period} value={period}>{period}</option>)}{kind === "lab" && ["wk", "mo"].includes(values.basis) && <option value={values.basis}>{values.basis} · imported</option>}</select></label>{input("rate", "Manual rate override", cost ? `Auto ${money(cost.c)}` : "Auto from type")}</> : <>{kind === "sub" && <>{input("qty", "Quantity")}<Field label="Unit" value={values.unit} onChange={v => update(row.id, { unit: v })} /></>}{input("cost", "Unit cost")}{kind === "mat" && input("waste", "Waste %")}</>}</div>
          {kind === "mat" && <Dimensions value={row as EstimateLine["res"]["mat"][number]} job={job} qty={result.qty} autoWt={cost?.autoWt} onChange={change => update(row.id, change as Record<string, string>)} />}
          {computed.warnings[`${row.id}:rate`] && <p className="text-amber-700 dark:text-amber-300 text-xs" role="status">{computed.warnings[`${row.id}:rate`]}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="estimate-number text-xs">{cost?.q.toLocaleString(undefined, { maximumFractionDigits: 4 })} × {money(cost?.c || 0)} = <strong>{money(cost?.amt || 0)}</strong></span><div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => patch({ res: { ...line.res, [kind]: [...rows, { ...structuredClone(row), id: newId() }] } } as Partial<EstimateLine>)}>Duplicate row</Button><Button variant="ghost" size="sm" className="text-destructive" onClick={() => { if (window.confirm("Delete this cost row?")) patch({ res: { ...line.res, [kind]: rows.filter(r => r.id !== row.id) } }); }}>Delete row</Button></div></div>
        </div>;
      })}</div></section>;
    })}
    <section className="space-y-2"><h4 className="font-semibold text-xs">Line markups · blank inherits category</h4><MarkupFields value={line} job={job} inherited={inherited} onChange={(key, value) => patch({ [key]: value })} /><ManualPrice job={job} value={line.priceOverride} calculated={result.calcUnit} onChange={priceOverride => patch({ priceOverride })} /></section>
    <TotalsStrip value={result} margin={result.margin} excluded={line.excluded || result.catExcluded} />
  </div>;
}
