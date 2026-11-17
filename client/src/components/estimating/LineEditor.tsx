import { Fragment, type ReactNode } from "react";
import { Copy, Trash2 } from "lucide-react";
import { CALCS, newId, money, type CalcType, type EstimateJob, type EstimateLine } from "@shared/estimating/model";
import { type Computation } from "@shared/estimating/engine";
import { Button } from "@/components/ui/button";
import { Field, Formula, ManualPrice, MarkupFields, WrappingInput } from "./EstimateFields";

type DimensionsValue = Pick<EstimateLine, "calc" | "n" | "l" | "w" | "d" | "wt" | "qty" | "unit">;
export function Dimensions({ value, onChange, job, qty, autoWt, hideCalculator = false }: { value: DimensionsValue; onChange: (patch: Partial<DimensionsValue>) => void; job: EstimateJob; qty?: number; autoWt?: number | null; hideCalculator?: boolean }) {
  const labels: Record<string, string> = { n: "Count", l: "Length · ft", w: "Width · ft", d: "Depth · ft", wt: "Weight · lb/ft", qty: "Quantity" };
  return <div className="estimate-dimensions">{!hideCalculator && <label className="estimate-field"><span>Calculator</span><select value={value.calc} onChange={e => onChange({ calc: e.target.value as CalcType })}>{Object.entries(CALCS).map(([key, calc]) => <option key={key} value={key}>{calc.label}</option>)}</select></label>}{CALCS[value.calc].fields.map(field => <Formula key={field} label={labels[field]} value={value[field]} job={job} qty={qty} onChange={v => onChange({ [field]: v })} placeholder={field === "wt" && autoWt != null ? `Auto ${autoWt.toFixed(3)}` : undefined} />)}{value.calc === "qty" && <Field label="Unit" value={value.unit} onChange={unit => onChange({ unit })} />}{autoWt != null && ["lbs", "tons"].includes(value.calc) && <p className="text-xs text-muted-foreground">Steel auto-weight: {autoWt.toFixed(3)} lb/ft. Enter weight to override.</p>}</div>;
}

export function LineEditor({ line, job, computed, onChange, inherited, moveControls }: { line: EstimateLine; job: EstimateJob; computed: Computation; onChange: (line: EstimateLine) => void; inherited: Record<"tax" | "oh" | "ins" | "profit", string | number>; moveControls?: ReactNode }) {
  const result = computed.items[line.id];
  const patch = (change: Partial<EstimateLine>) => onChange({ ...line, ...change });
  const kinds = ["mat", "lab", "eq", "sub"] as const;
  return <div className="estimate-line-body border-t">
    <Dimensions job={job} value={line} onChange={patch} autoWt={result.autoWt} />
    <div className="estimate-notes"><Field label="Drawing reference" value={line.ref} onChange={ref => patch({ ref })} /><Field label="Flag / note" value={line.flag} onChange={flag => patch({ flag })} />{moveControls}<span className="text-xs text-muted-foreground">Takeoff <strong className="estimate-number">{result.qty.toLocaleString(undefined, { maximumFractionDigits: 4 })} {result.unit}</strong> · use <code>qty</code> in cost formulas</span></div>
    <div className="estimate-resources">{kinds.map(kind => {
      const rows = line.res[kind], typed = kind === "lab" || kind === "eq";
      const title = { mat: "Material", lab: "Labor", eq: "Equipment", sub: "Subcontract / other" }[kind];
      const update = (id: string, change: Record<string, string>) => patch({ res: { ...line.res, [kind]: rows.map(row => row.id === id ? { ...row, ...change } : row) } });
      const headings = typed ? ["Type / description", "Crew", "Duration", "Basis", "Rate", "Amount", ""] : kind === "mat" ? ["Description", "Calc", "Qty", "Unit", "Waste %", "Cost", "Amount", ""] : ["Description", "Qty", "Unit", "Cost", "Amount", ""];
      return <section key={kind} className="estimate-panel estimate-resource" aria-label={`${title} costs`}>
        <h4>{title}<span className="estimate-number">{money(result[kind])}</span></h4>
        <div className="estimate-scroll"><table><thead><tr>{headings.map((heading, i) => <th key={i} scope="col">{heading}</th>)}</tr></thead><tbody>
          {rows.length === 0 && <tr><td colSpan={headings.length} className="text-muted-foreground">No {title.toLowerCase()} costs. Add a row to build this price.</td></tr>}
          {rows.map(row => {
            const values = row as unknown as Record<string, string>, cost = computed.res[row.id];
            const options = kind === "lab" ? job.laborRates : job.equipRates;
            const typeField = kind === "lab" ? "ltype" : "etype";
            const input = (field: string, label: string, placeholder?: string) => <Formula label={label} value={values[field] || ""} onChange={v => update(row.id, { [field]: v })} job={job} qty={result.qty} placeholder={placeholder} />;
            const autoRate = typed ? computed.tables[kind][values[typeField]]?.[values.basis || "day"] : undefined;
            return <Fragment key={row.id}><tr>
              <td data-label={typed ? "Type / description" : "Description"}>{typed ? <div className="space-y-1"><select aria-label={kind === "lab" ? "Labor type" : "Equipment type"} value={values[typeField]} onChange={e => update(row.id, { [typeField]: e.target.value })}><option value="">Manual · no type</option>{values[typeField] && !options.some(r => r.id === values[typeField]) && <option value={values[typeField]}>Missing imported type</option>}{options.map(rate => <option key={rate.id} value={rate.id}>{rate.name || "Unnamed type"}</option>)}</select><WrappingInput label={`${title} description`} value={row.desc} placeholder="Note / description" onChange={desc => update(row.id, { desc })} /></div> : <WrappingInput label={`${title} description`} value={row.desc} onChange={desc => update(row.id, { desc })} />}</td>
              {typed ? <>
                <td data-label={kind === "lab" ? "Crew count" : "Equipment count"}>{input("crew", kind === "lab" ? "Crew count" : "Equipment count", "1")}</td>
                <td data-label="Duration">{input("dur", "Duration")}</td>
                <td data-label="Basis"><select aria-label="Period" value={values.basis || "day"} onChange={e => update(row.id, { basis: e.target.value })}>{(kind === "lab" ? ["hr", "day"] : ["hr", "day", "wk", "mo"]).map(period => <option key={period} value={period}>{period}</option>)}{kind === "lab" && ["wk", "mo"].includes(values.basis) && <option value={values.basis}>{values.basis} · imported</option>}</select></td>
                <td data-label="Rate" className={values.rate?.trim() ? "estimate-manual" : ""}>{input("rate", "Manual rate override", autoRate == null ? "No rate" : money(autoRate))}{values.rate?.trim() && <button className="text-[10px] text-destructive underline" aria-label={`Reset ${title.toLowerCase()} rate`} onClick={() => update(row.id, { rate: "" })}>Reset</button>}</td>
              </> : <>
                {kind === "mat" && <td data-label="Calculator"><select aria-label="Material calculator" value={values.calc} onChange={e => update(row.id, { calc: e.target.value })}>{Object.entries(CALCS).map(([key]) => <option key={key} value={key}>{key.toUpperCase()}</option>)}</select></td>}
                <td data-label="Quantity">{kind === "mat" && values.calc !== "qty" ? <span className="estimate-number block text-right">{cost?.q.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span> : input("qty", "Quantity", values.cost?.trim() ? "1" : "0")}</td>
                <td data-label="Unit">{kind === "mat" && values.calc !== "qty" ? CALCS[values.calc as CalcType].unit : <Field label="Unit" value={values.unit} onChange={unit => update(row.id, { unit })} />}</td>
                {kind === "mat" && <td data-label="Waste %">{input("waste", "Waste %", "0")}</td>}
                <td data-label="Unit cost">{input("cost", "Unit cost")}</td>
              </>}
              <td data-label="Amount" className="estimate-amount estimate-number">{money(cost?.amt || 0)}</td>
              <td><div className="flex"><button className="estimate-icon" title="Duplicate row" aria-label={`Duplicate ${title.toLowerCase()} row`} onClick={() => patch({ res: { ...line.res, [kind]: [...rows, { ...structuredClone(row), id: newId() }] } } as Partial<EstimateLine>)}><Copy size={13} /></button><button className="estimate-icon" title="Delete row" aria-label={`Delete ${title.toLowerCase()} row`} onClick={() => { if (window.confirm("Delete this cost row?")) patch({ res: { ...line.res, [kind]: rows.filter(r => r.id !== row.id) } }); }}><Trash2 size={13} /></button></div></td>
            </tr>
              {kind === "mat" && values.calc !== "qty" && <tr><td colSpan={headings.length}><Dimensions value={row as EstimateLine["res"]["mat"][number]} hideCalculator job={job} qty={result.qty} autoWt={cost?.autoWt} onChange={change => update(row.id, change as Record<string, string>)} /></td></tr>}
              {computed.warnings[`${row.id}:rate`] && <tr><td colSpan={headings.length}><p className="text-amber-700 dark:text-amber-300 text-xs" role="status">{computed.warnings[`${row.id}:rate`]}</p></td></tr>}
            </Fragment>;
          })}
        </tbody></table></div>
        <div className="estimate-resource-foot"><Button variant="ghost" size="sm" aria-label={`Add ${title.toLowerCase()} row`} onClick={() => {
          const base = { id: newId(), desc: "" };
          const row = kind === "mat" ? { ...base, calc: "qty", n: "", l: "", w: "", d: "", wt: "", qty: "", unit: "", waste: "", cost: "" } : kind === "sub" ? { ...base, qty: "", unit: "", cost: "" } : { ...base, ltype: "", etype: "", crew: "1", dur: "", basis: "day", rate: "" };
          patch({ res: { ...line.res, [kind]: [...rows, row] } } as Partial<EstimateLine>);
        }}>+ Add row</Button><span className="text-xs">Subtotal <strong className="estimate-number ml-2">{money(result[kind])}</strong></span></div>
      </section>;
    })}</div>
    <div className="estimate-pricing">
      <section><h4 className="font-semibold text-xs mb-2">Line pricing · blank markups inherit category</h4><MarkupFields value={line} job={job} inherited={inherited} onChange={(key, value) => patch({ [key]: value })} /><div className="mt-3 max-w-60"><span className="text-xs text-muted-foreground block mb-1">Unit price · calculated or manual</span><ManualPrice job={job} value={line.priceOverride} calculated={result.calcUnit} onChange={priceOverride => patch({ priceOverride })} /></div></section>
      <section><h4 className="font-semibold text-xs mb-2">Price buildup{line.excluded || result.catExcluded ? " · excluded, would-be amounts" : ""}</h4><dl className="estimate-buildup">
        {(["mat", "tax", "lab", "eq", "sub", "cost", "oh", "ins", "profit", "sell"] as const).map(key => <Fragment key={key}><dt className={key === "sell" || key === "cost" ? "font-semibold border-t pt-1" : ""}>{{ mat: "Material", tax: "Material tax", lab: "Labor", eq: "Equipment", sub: "Subcontract / other", cost: "Total cost", oh: "Overhead", ins: "Insurance", profit: "Profit", sell: "Sell" }[key]}</dt><dd className={`estimate-number ${key === "sell" || key === "cost" ? "font-semibold border-t pt-1" : ""}`}>{money(result[key])}</dd></Fragment>)}
        <dt className={result.overridden ? "estimate-buildup-manual" : ""}>Unit price{result.overridden ? " · manual" : ""}</dt><dd className={`estimate-number${result.overridden ? " estimate-buildup-manual" : ""}`}>{money(result.unitPrice)}</dd>
        <dt>Margin</dt><dd className="estimate-number">{(result.margin * 100).toFixed(2)}%</dd>
      </dl></section>
    </div>
  </div>;
}
