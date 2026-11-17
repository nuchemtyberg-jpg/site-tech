import { useState } from "react";
import type { EstimateRates } from "@shared/estimating/model";
import { RATE_TABS, type RatePreview, type RateTab } from "@shared/estimating/rate-import";
import { useApplyRateImport, usePreviewRateImport, type CompanyRatesResult } from "@/hooks/use-rate-import";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import "./rate-management.css";

type Upload = { file: File; tab: RateTab };
const MAX_BYTES = 10 * 1024 * 1024;
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}. Select the file again.`));
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(file);
  });
}
export function RateImportDialog({ estimateRates, onClose, onApplied }: { estimateRates?: EstimateRates; onClose: () => void; onApplied: (result: CompanyRatesResult) => void }) {
  const previewMutation = usePreviewRateImport();
  const applyMutation = useApplyRateImport();
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [preview, setPreview] = useState<RatePreview>();
  const [replaceDefaultMarkups, setReplaceDefaultMarkups] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const busy = reading || previewMutation.isPending || applyMutation.isPending;
  const selectFiles = (files: File[]) => {
    setError(""); setPreview(undefined);
    if (files.length > 4) { setUploads([]); setError("Select at most four files."); return; }
    if (files.reduce((total, file) => total + file.size, 0) > MAX_BYTES) { setUploads([]); setError("Selected files exceed the 10 MB total limit."); return; }
    if (files.some(file => !/\.(xlsx|csv)$/i.test(file.name))) { setUploads([]); setError("Choose an .xlsx workbook or .csv files only."); return; }
    if (files.some(file => /\.xlsx$/i.test(file.name)) && files.length !== 1) { setUploads([]); setError("Choose one XLSX workbook, or up to four CSV files; do not mix them."); return; }
    setUploads(files.map((file, index) => ({ file, tab: RATE_TABS[index] })));
  };
  const requestPreview = async () => {
    setError(""); setReading(true);
    try {
      const input = estimateRates ? {
        source: "estimate" as const,
        rates: { rates: estimateRates.rates, laborRates: estimateRates.laborRates, equipRates: estimateRates.equipRates, defaults: estimateRates.defaults, markupNotes: estimateRates.markupNotes },
        replaceDefaultMarkups,
      } : {
        source: "spreadsheet" as const,
        files: await Promise.all(uploads.map(async ({ file, tab }) => ({ name: file.name, data: await readBase64(file), ...(/\.csv$/i.test(file.name) ? { tab } : {}) }))),
      };
      const result = await previewMutation.mutateAsync(input);
      setPreview(result);
    } catch (cause) { setError((cause as Error).message); }
    finally { setReading(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !applyMutation.isPending) onClose(); }}><DialogContent className="rate-dialog sm:max-w-[960px]" onEscapeKeyDown={event => { if (applyMutation.isPending) event.preventDefault(); }} onInteractOutside={event => { if (applyMutation.isPending) event.preventDefault(); }}><DialogHeader><DialogTitle>{estimateRates ? "Save as company rates" : "Import company rates"}</DialogTitle><DialogDescription>{estimateRates ? "Share rates from this estimate draft with the company. This does not save or change the estimate." : "Import one XLSX workbook with named tabs or up to four CSV files. Preview changes before anything is saved."} Matching rates are updated, new rates are added, and unmatched company rates are kept.</DialogDescription></DialogHeader>
    <div className="rate-import-body space-y-4">
      {!preview && <>
        {estimateRates ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={replaceDefaultMarkups} disabled={busy} onChange={event => setReplaceDefaultMarkups(event.target.checked)} className="mt-1" /><span>Also replace default markups<span className="block text-xs text-muted-foreground mt-1">Off by default. Includes markup notes when selected.</span></span></label> : <>
          <label className="block space-y-2 text-sm"><span className="font-medium">Spreadsheet files · 10 MB total maximum</span><input aria-label="Rate spreadsheet files" type="file" accept=".xlsx,.csv" multiple disabled={busy} className="block text-xs" onChange={event => { selectFiles(Array.from(event.target.files || [])); event.target.value = ""; }} /></label>
          {uploads.map((upload, index) => <div className="rate-file" key={`${index}-${upload.file.name}`}><span>{upload.file.name} <small className="text-muted-foreground">({(upload.file.size / 1024).toFixed(1)} KB)</small></span>{/\.csv$/i.test(upload.file.name) ? <label className="flex items-center gap-2"><span className="text-xs">Assign tab</span><select aria-label={`Tab for ${upload.file.name}`} disabled={busy} value={upload.tab} onChange={event => setUploads(current => current.map((item, i) => i === index ? { ...item, tab: event.target.value as RateTab } : item))}>{RATE_TABS.map(tab => <option key={tab}>{tab}</option>)}</select></label> : <span className="text-xs text-muted-foreground">Uses named workbook tabs</span>}</div>)}
          <details className="border rounded p-3"><summary className="cursor-pointer font-medium">Workbook tabs & expected headers</summary><ul className="space-y-2 mt-3 text-xs text-muted-foreground"><li><strong>Materials:</strong> Category | Key | Description | Unit | Price | Source / notes</li><li><strong>Labor:</strong> Labor type | Hourly rate | Day rate (8 hrs) | Notes</li><li><strong>Equipment:</strong> Equipment type | Hour | Day | Week | Month | Notes</li><li><strong>Markups:</strong> Default markup | Percent | Notes<br />Rows: Material tax, Overhead, Insurance, Profit.</li></ul><p className="mt-3 text-xs text-muted-foreground">Text formulas keep their meaning. Spreadsheet formulas use cached results only; formulas are never executed. Blank prices remain blank.</p></details>
        </>}
      </>}
      {preview && <RateImportPreview preview={preview} />}
      {(reading || previewMutation.isPending) && <div aria-label="Preparing rate preview" className="space-y-2"><div className="h-12 rounded bg-muted animate-pulse" /><div className="h-24 rounded bg-muted animate-pulse" /></div>}
      {error && <p role="alert" className="border border-destructive/40 rounded p-3 text-sm text-destructive">{error}{preview && " Company rates were not replaced by this request. If the preview is stale, go back and preview again."}</p>}
    </div>
    <DialogFooter className="flex-wrap gap-2"><Button variant="outline" disabled={applyMutation.isPending} onClick={onClose}>Cancel</Button>{preview ? <><Button variant="outline" disabled={busy} onClick={() => { setPreview(undefined); setError(""); }}>Back to source</Button><Button disabled={busy || preview.errors.length > 0 || !preview.token} onClick={() => {
      if (!preview.token || preview.errors.length) return;
      setError("");
      applyMutation.mutate(preview.token, { onSuccess: result => { onApplied(result); onClose(); }, onError: cause => setError(cause.message) });
    }}>{applyMutation.isPending ? "Applying…" : "Confirm company rate changes"}</Button></> : <Button disabled={busy || (!estimateRates && !uploads.length)} onClick={() => void requestPreview()}>Preview changes</Button>}</DialogFooter>
  </DialogContent></Dialog>;
}

export function RateImportPreview({ preview }: { preview: RatePreview }) {
  return <div className="space-y-3">
    <div className="rate-preview-counts" role="status"><span><strong>{preview.counts.new}</strong> new</span><span><strong>{preview.counts.changed}</strong> changed</span><span><strong>{preview.counts.unchanged}</strong> unchanged</span><span className="text-muted-foreground">Against version {preview.version}</span></div>
    {preview.errors.length > 0 && <div role="alert" className="border border-destructive/40 rounded p-3 text-destructive"><h4 className="font-semibold">Resolve these errors before applying</h4><ul className="list-disc pl-5 mt-2 space-y-1">{preview.errors.map((message, index) => <li key={index}>{message}</li>)}</ul></div>}
    {preview.warnings.length > 0 && <div className="border rounded p-3"><h4 className="font-semibold">Review warnings</h4><ul className="list-disc pl-5 mt-2 space-y-1">{preview.warnings.map((message, index) => <li key={index}>{message}</li>)}</ul></div>}
    {!preview.token && preview.errors.length === 0 && <p role="alert">No confirmation token was returned. Go back and generate a fresh preview before applying.</p>}
    <p className="text-xs text-muted-foreground">Nothing changes until you confirm. Existing rates not listed here are kept.</p>
    {preview.changes.map((change, index) => <details key={index} className="rate-preview-change" open={change.status !== "unchanged"}><summary className="cursor-pointer"><strong>{change.label || "Unnamed rate"}</strong><span className="text-xs text-muted-foreground"> · {change.section} · {change.status}</span></summary><div className="rate-preview-values"><div><p className="font-medium text-xs mb-2">Old</p>{change.before ? <RateValues values={change.before} /> : <p className="text-xs text-muted-foreground">New company rate</p>}</div><div><p className="font-medium text-xs mb-2">New</p><RateValues values={change.after} /></div></div></details>)}
    {preview.changes.length === 0 && <p className="border rounded p-4">No rate changes were found in this source.</p>}
  </div>;
}
function RateValues({ values }: { values: Record<string, string> }) {
  return <dl>{Object.entries(values).map(([key, value]) => <div className="contents" key={key}><dt>{key}</dt><dd>{value === "" ? <span className="text-muted-foreground">Not set{key === "value" || key === "price" ? " · no price" : ""}</span> : value}</dd></div>)}</dl>;
}
