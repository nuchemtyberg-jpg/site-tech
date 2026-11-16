import { useEffect, useRef, useState } from "react";
import { canEstimate, emptyJob, type EstimateRates } from "@shared/estimating/model";
import { computeJob } from "@shared/estimating/engine";
import { useAuth } from "@/hooks/use-auth";
import { useEstimatingRates, useSaveEstimatingRates } from "@/hooks/use-estimates";
import { Button } from "@/components/ui/button";
import { RatesEditor } from "@/components/estimating/RatesEditor";
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
  const initialized = useRef(false);
  useEffect(() => { if (query.data && !initialized.current) { initialized.current = true; setRates(structuredClone(query.data.rates)); setSaved(JSON.stringify(query.data.rates)); setVersion(query.data.version); } }, [query.data]);
  const dirty = !!rates && JSON.stringify(rates) !== saved;
  useUnsavedEstimate(dirty);
  if (query.isLoading) return <div className="space-y-3"><div className="h-14 bg-muted rounded animate-pulse" /><div className="h-64 bg-muted rounded animate-pulse" /></div>;
  if (query.isError) return <div role="alert" className="p-5 border rounded space-y-3"><p>Could not load company rates: {query.error.message}</p><Button onClick={() => query.refetch()} variant="outline">Retry</Button></div>;
  if (!rates) return null;
  const errors = Object.values(computeJob({ ...emptyJob(), ...rates }).errs);
  return <div className="space-y-5"><header className="flex flex-wrap gap-3 justify-between"><div><h1 className="text-2xl font-bold">Estimating Rates</h1><p className="text-sm text-muted-foreground mt-1">Company defaults for new estimates. Saved revisions keep their own rates.</p></div><div className="flex items-center gap-3"><span className="text-xs text-muted-foreground">{dirty ? "Unsaved changes" : `Saved · version ${version}`}</span><Button disabled={!dirty || save.isPending || errors.length > 0} onClick={() => {
    save.mutate({ rates, version }, { onSuccess: () => { setSaved(JSON.stringify(rates)); setVersion(version + 1); setMessage("Company rates saved."); }, onError: error => setMessage(`${error.message} Your draft is preserved. If another user changed rates, reload and reconcile before retrying.`) });
  }}>{save.isPending ? "Saving…" : "Save company rates"}</Button><Button variant="outline" disabled={save.isPending || query.isFetching} onClick={async () => {
    if (dirty && !window.confirm("Discard local rate edits and reload saved company rates?")) return;
    const result = await query.refetch();
    if (result.data && !result.isError) {
      setRates(structuredClone(result.data.rates)); setSaved(JSON.stringify(result.data.rates)); setVersion(result.data.version); setMessage("Loaded the current company rates.");
    } else setMessage("Could not reload saved rates. Your draft has been kept. Retry when the connection is restored.");
  }}>Reload saved rates</Button></div></header>{message && <p role="status" className="border rounded p-3">{message}</p>}{errors.length > 0 && <p role="alert" className="text-destructive text-sm">{errors.length} invalid formulas or keys. Correct the marked fields before saving.</p>}<RatesEditor rates={rates} onChange={setRates} /></div>;
}
