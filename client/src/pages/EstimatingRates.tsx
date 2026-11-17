import { useEffect, useRef, useState } from "react";
import { canEstimate, emptyJob, type EstimateRates } from "@shared/estimating/model";
import { computeJob } from "@shared/estimating/engine";
import { useAuth } from "@/hooks/use-auth";
import { useEstimatingRates, useSaveEstimatingRates } from "@/hooks/use-estimates";
import type { CompanyRatesResult } from "@/hooks/use-rate-import";
import { Button } from "@/components/ui/button";
import { RatesEditor } from "@/components/estimating/RatesEditor";
import { RateImportDialog } from "@/components/estimating/RateImportDialog";
import { RateHistory } from "@/components/estimating/RateHistory";
import { useUnsavedEstimate } from "@/components/estimating/use-unsaved-estimate";
import NotFound from "@/pages/not-found";

export default function EstimatingRates() {
  const { user } = useAuth();
  return canEstimate(user?.role) ? <CompanyRates /> : <NotFound />;
}
function CompanyRates() {
  const query = useEstimatingRates(), save = useSaveEstimatingRates();
  const [rates, setRates] = useState<EstimateRates>();
  const [version, setVersion] = useState(0);
  const [saved, setSaved] = useState("");
  const [message, setMessage] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  const currentRates = useRef(rates); currentRates.current = rates;
  const initialized = useRef(false);
  const accept = (result: CompanyRatesResult) => {
    setRates(structuredClone(result.rates)); setSaved(JSON.stringify(result.rates)); setVersion(result.version);
  };
  useEffect(() => { if (query.data && !initialized.current) { initialized.current = true; setRates(structuredClone(query.data.rates)); setSaved(JSON.stringify(query.data.rates)); setVersion(query.data.version); } }, [query.data]);
  const dirty = !!rates && JSON.stringify(rates) !== saved;
  useUnsavedEstimate(dirty);
  if (query.isLoading) return <div className="space-y-3"><div className="h-14 bg-muted rounded animate-pulse" /><div className="h-64 bg-muted rounded animate-pulse" /></div>;
  if (!rates && query.isError) return <div role="alert" className="p-5 border rounded space-y-3"><p>Could not load company rates: {query.error.message}</p><Button onClick={() => query.refetch()} variant="outline">Retry</Button></div>;
  if (!rates) return null;
  const errors = Object.values(computeJob({ ...emptyJob(), ...rates }).errs);
  return <div className="estimate-workspace min-w-0 space-y-5"><header className="flex flex-wrap gap-3 justify-between"><div><h1 className="text-2xl font-bold">Estimating Rates</h1><p className="text-sm text-muted-foreground mt-1">Company defaults for new estimates. Saved revisions keep their own rates.</p></div><div className="flex flex-wrap items-center gap-3"><span className="text-xs text-muted-foreground">{dirty ? "Unsaved changes" : `Saved · version ${version}`}</span><Button disabled={!dirty || save.isPending || reloading || errors.length > 0} onClick={() => {
    const submitted = JSON.stringify(rates);
    save.mutate({ rates, version }, { onSuccess: result => {
      const keepNewerDraft = JSON.stringify(currentRates.current) !== submitted;
      setSaved(JSON.stringify(result.rates)); setVersion(result.version);
      if (!keepNewerDraft) setRates(structuredClone(result.rates));
      setMessage(`Company rates saved.${keepNewerDraft ? " Newer local edits are still unsaved." : ""}`);
    }, onError: error => setMessage(`${error.message} Your draft is preserved. If another user changed rates, reload and reconcile before retrying.`) });
  }}>{save.isPending ? "Saving…" : "Save company rates"}</Button><Button variant="outline" disabled={save.isPending || reloading || query.isFetching} onClick={async () => {
    if (dirty && !window.confirm("Discard local rate edits and reload saved company rates?")) return;
    setReloading(true);
    try {
      const result = await query.refetch();
      if (result.data && !result.isError) { accept(result.data); setMessage("Loaded the current company rates."); }
      else setMessage("Could not reload saved rates. Your draft has been kept. Retry when the connection is restored.");
    } finally { setReloading(false); }
  }}>Reload saved rates</Button><Button variant="outline" disabled={dirty || save.isPending || reloading} onClick={() => setImportOpen(true)} aria-describedby={dirty ? "rate-import-draft-warning" : undefined}>Import spreadsheet</Button></div></header>
    {dirty && <p id="rate-import-draft-warning" className="border rounded p-3 text-sm bg-muted/40">Spreadsheet import is disabled while you have unsaved company rate edits. Save your changes or use Reload saved rates before importing. Your draft will not be discarded automatically.</p>}
    {message && <p role="status" className="border rounded p-3 text-sm">{message}</p>}
    {errors.length > 0 && <p role="alert" className="text-destructive text-sm">{errors.length} invalid formulas or keys. Correct the marked fields before saving.</p>}
    <RatesEditor rates={rates} onChange={setRates} readOnly={importOpen || reloading} />
    <RateHistory />
    {importOpen && <RateImportDialog onClose={() => setImportOpen(false)} onApplied={result => { accept(result); setMessage(`Company rate import applied · version ${result.version}.`); }} />}
  </div>;
}
