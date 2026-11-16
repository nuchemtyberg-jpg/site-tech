import { computeJob, type Computation, type Totals } from "@shared/estimating/engine";
import { CALCS, type EstimateJob } from "@shared/estimating/model";
import { coverTitle } from "./cover-title";

export function csvCell(value: unknown) {
  let text = String(value ?? "");
  // Prefix dangerous text, including formulas hidden behind whitespace/control characters.
  if (typeof value !== "number" && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}
export function estimateCsv(job: EstimateJob, detail = false) {
  const c = computeJob(job);
  const rows: unknown[][] = [["Takeoff & pricing", job.name], ["Job number", job.number], ["Client", job.client], ["Location", job.location], ["Bid date", job.bidDate], ["Prepared by", job.preparedBy], []];
  if (detail) appendDetail(rows, job, c);
  else appendCover(rows, job, c);
  rows.push([], ["Notes, inclusions & exclusions", job.notes]);
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
}
function appendCover(rows: unknown[][], job: EstimateJob, c: Computation) {
  rows.push(["No.", "Description", ...(job.coverShowTakeoff ? ["Quantity", "Unit"] : []), "Unit price", "Amount"]);
  for (const [ci, cat] of job.categories.filter(cat => !cat.excluded).entries()) {
    rows.push([ci + 1, coverTitle(cat.name), ...(job.coverShowTakeoff ? ["", ""] : []), "", c.cats[cat.id].sell]);
    for (const [li, line] of cat.items.filter(line => !line.excluded).entries()) {
      const r = c.items[line.id];
      rows.push([`${ci + 1}.${li + 1}`, [coverTitle(line.desc), line.size].filter(Boolean).join(", "), ...(job.coverShowTakeoff ? [r.qty, r.unit] : []), r.unitPrice, r.sell]);
    }
  }
  rows.push(["", "Total estimate", ...(job.coverShowTakeoff ? ["", ""] : []), "", c.total.sell]);
}
function appendDetail(rows: unknown[][], job: EstimateJob, c: Computation) {
  rows.push(["Category", "Item", "Line / resource description", "Cost type", "Measure / formulas", "Quantity", "Unit", "Unit cost", "Resource amount", "Material", "Labor", "Equipment", "Subcontract", "Tax", "Total cost", "Overhead", "Insurance", "Profit", "Sell", "Takeoff quantity", "Takeoff unit", "Unit price", "Calculated unit price", "Margin %", "Manual price", "Drawing reference", "Flag", "Excluded", "Warning"]);
  const totals = (t: Totals) => [t.mat, t.lab, t.eq, t.sub, t.tax, t.cost, t.oh, t.ins, t.profit, t.sell];
  for (const [ci, cat] of job.categories.entries()) {
    for (const [li, line] of cat.items.entries()) {
      const r = c.items[line.id], no = `${ci + 1}.${li + 1}`, excluded = cat.excluded || line.excluded ? "Yes · would-be amounts" : "No";
      const description = [line.desc, line.size].filter(Boolean).join(", ");
      for (const kind of ["mat", "lab", "eq", "sub"] as const) for (const row of line.res[kind]) {
        const rc = c.res[row.id];
        const fields = row as unknown as Record<string, string>;
        let typeName = "", unit = fields.unit || "";
        let measure = "";
        if (kind === "mat") {
          const calc = fields.calc as keyof typeof CALCS;
          measure = `${CALCS[calc].label}; ${CALCS[calc].fields.map(key => `${key}=${fields[key] || "(blank)"}`).join("; ")}; waste=${fields.waste || "0"}%; cost=${fields.cost}`;
          unit = CALCS[calc].unit || unit;
        } else if (kind === "sub") measure = `qty=${fields.qty || "(blank)"}; cost=${fields.cost}`;
        else {
          const types = kind === "lab" ? job.laborRates : job.equipRates;
          typeName = types.find(type => type.id === fields[kind === "lab" ? "ltype" : "etype"])?.name || "Manual / missing type";
          unit = fields.basis || "day";
          measure = `${typeName}; count=${fields.crew || "1"}; duration=${fields.dur}; period=${unit}; rate=${fields.rate || "(derived)"}`;
        }
        const rowErrors = Object.entries(c.errs).filter(([key]) => key.startsWith(`${row.id}:`)).map(([, error]) => error).join("; ");
        rows.push([cat.name, no, row.desc || typeName, ({ mat: "Material", lab: "Labor", eq: "Equipment", sub: "Subcontract / other" })[kind], measure, rc.q, unit, rc.c, rc.amt, ...Array(18).fill(""), excluded, c.warnings[`${row.id}:rate`] || rowErrors]);
      }
      rows.push([cat.name, no, description, "LINE TOTAL", CALCS[line.calc].fields.map(key => `${key}=${line[key]}`).join("; "), "", "", "", "", ...totals(r), r.qty, r.unit, r.unitPrice, r.calcUnit, r.margin * 100, line.priceOverride, line.ref, line.flag, excluded, Object.entries(c.errs).filter(([key]) => key.startsWith(`${line.id}:`)).map(([, error]) => error).join("; ")]);
    }
    const t = c.cats[cat.id];
    rows.push([cat.name, "", "CATEGORY TOTAL", "", "", "", "", "", "", ...totals(t), "", "", "", "", t.sell ? (t.sell - t.cost) / t.sell * 100 : 0, "", "", "", cat.excluded ? "Yes · would-be amounts" : "No", `${t.exCount} excluded lines; excluded would-be sell ${t.exSell}`]);
  }
  rows.push(["JOB TOTAL", "", "In-scope only", "", "", "", "", "", "", ...totals(c.total), "", "", "", "", c.margin * 100]);
}
export function downloadCsv(job: EstimateJob, detail = false) {
  const blob = new Blob([estimateCsv(job, detail)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${(job.name || "Estimate").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")} - ${detail ? "detail" : "cover"}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
