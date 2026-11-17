import { useEffect, useMemo, useRef, useState } from "react";
import { computeJob, refreshRates } from "@shared/estimating/engine";
import { money, type EstimateJob, type EstimateRates, type EstimateRevision } from "@shared/estimating/model";
import { EstimateApiError, useEstimateRevision, useEstimateRevisions, useEstimatingRates, useSaveEstimate } from "@/hooks/use-estimates";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TakeoffEditor } from "./TakeoffEditor";
import { RatesEditor } from "./RatesEditor";
import { RateImportDialog } from "./RateImportDialog";
import { EstimateCover } from "./EstimateCover";
import { downloadCsv } from "./exports";
import { discardEstimate, useUnsavedEstimate } from "./use-unsaved-estimate";
import { ClaudeTakeoff, type TakeoffFocus } from "./ClaudeTakeoff";
import "./estimating.css";

export function EstimateTab({ opportunityId, onDirtyChange }: { opportunityId: number; onDirtyChange: (dirty: boolean) => void }) {
  const revisions = useEstimateRevisions(opportunityId);
  const save = useSaveEstimate(opportunityId);
  const [selected, setSelected] = useState<number>();
  const [base, setBase] = useState<EstimateRevision>();
  const [job, setJob] = useState<EstimateJob>();
  const [view, setView] = useState("takeoff");
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState<EstimateRevision>();
  const [nameOpen, setNameOpen] = useState(false);
  const [name, setName] = useState("");
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [shareRates, setShareRates] = useState<EstimateRates>();
  const [focus, setFocus] = useState<TakeoffFocus>();
  const file = useRef<HTMLInputElement>(null);
  const submitted = useRef<string>();
  const currentJob = useRef(job); currentJob.current = job;
  const loaded = useEstimateRevision(opportunityId, selected);
  const ordered = useMemo(() => [...(revisions.data || [])].sort((a, b) => b.revisionNumber - a.revisionNumber), [revisions.data]);
  const dirty = !!job && !!base && JSON.stringify(job) !== JSON.stringify(base.job);
  const dirtyCallback = useRef(onDirtyChange); dirtyCallback.current = onDirtyChange;
  useUnsavedEstimate(dirty);
  useEffect(() => { dirtyCallback.current(dirty); }, [dirty]);
  useEffect(() => () => dirtyCallback.current(false), []);
  useEffect(() => { if (!selected && ordered.length) setSelected(ordered[0].id); }, [selected, ordered]);
  useEffect(() => {
    if (loaded.data && loaded.data.id === selected && base?.id !== selected) { setBase(loaded.data); setJob(structuredClone(loaded.data.job)); setMessage(""); setConflict(undefined); }
  }, [loaded.data, selected, base?.id]);
  const accept = (revision: EstimateRevision) => {
    // A slow request must never overwrite edits made while it was in flight.
    const keepNewerDraft = submitted.current !== undefined && currentJob.current !== undefined && JSON.stringify(currentJob.current) !== submitted.current;
    submitted.current = undefined;
    setSelected(revision.id); setBase(revision); if (!keepNewerDraft) setJob(structuredClone(revision.job)); setConflict(undefined); setNameOpen(false); setMessage(`Saved Rev ${revision.revisionNumber}.${keepNewerDraft ? " Newer local edits are still unsaved." : ""}`); dirtyCallback.current(keepNewerDraft);
  };
  const failed = (error: Error) => {
    submitted.current = undefined;
    if (error instanceof EstimateApiError && error.status === 409 && error.body.current) { setConflict(error.body.current); setMessage("Another estimator saved this revision. Your draft has been kept."); }
    else if (error instanceof EstimateApiError && error.status === 423) { setBase(previous => previous ? { ...previous, locked: true, lockReason: error.body.message || "Revision is locked." } : previous); setMessage("This revision is locked. Save your draft as a new revision."); }
    else setMessage(error.message);
  };
  const calculated = useMemo(() => job ? computeJob(job) : undefined, [job]);
  const errors = Object.entries(calculated?.errs || {});
  const warnings = Object.entries(calculated?.warnings || {});
  const confirmFormulaSave = () => errors.length === 0 || window.confirm(`${errors.length} formula errors — those values count as zero. Save anyway?`);
  const importJson = async (upload: File) => {
    if (dirty && !discardEstimate()) return;
    try { const importFile = JSON.parse(await upload.text()); save.mutate({ importFile }, { onSuccess: accept, onError: failed }); }
    catch (error) { setMessage(`Import failed: ${(error as Error).message}`); }
  };
  if (revisions.isLoading) return <div className="space-y-3 p-4" aria-label="Loading estimate revisions"><div className="h-12 rounded bg-muted animate-pulse" /><div className="h-40 rounded bg-muted animate-pulse" /></div>;
  if (revisions.isError) return <div role="alert" className="p-5 border rounded-lg space-y-3"><p>Could not load estimate revisions: {revisions.error.message}</p><Button onClick={() => revisions.refetch()} variant="outline">Retry</Button></div>;
  return <div className="estimate-workspace space-y-3">
    <div className="estimate-toolbar estimate-sticky"><div className="mr-auto min-w-0"><h2 className="estimate-job-title">{job?.name || "Takeoff & pricing"}</h2><p className="text-xs text-muted-foreground">{base ? `Rev ${base.revisionNumber} · ${base.locked ? "Locked · " : ""}` : ""}Standalone estimate{errors.length > 0 ? ` · ${errors.length} formula errors` : " · changes stay local until saved"}</p></div>{ordered.length > 0 && <label className="estimate-field"><span>Revision · newest first</span><select aria-label="Estimate revision" value={selected || ""} onChange={e => { if (!dirty || discardEstimate()) { setSelected(Number(e.target.value)); setJob(undefined); setBase(undefined); } }}>{ordered.map(revision => <option key={revision.id} value={revision.id}>Rev {revision.revisionNumber}{revision.name ? ` · ${revision.name}` : ""}{revision.locked ? " · Locked" : ""}</option>)}</select></label>}
      <Button variant="outline" size="sm" disabled={save.isPending} onClick={() => file.current?.click()}>Import takeoff JSON</Button><input ref={file} type="file" accept=".json,application/json" className="hidden" aria-label="Import takeoff JSON file" onChange={e => { const upload = e.target.files?.[0]; if (upload) void importJson(upload); e.target.value = ""; }} />
      {job && <><span role="status" className={`text-xs font-medium ${dirty ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{dirty ? "Unsaved changes" : "All changes saved"}</span><Button size="sm" disabled={!dirty || !!base?.locked || save.isPending} onClick={() => { if (base && confirmFormulaSave()) { submitted.current = JSON.stringify(job); save.mutate({ revisionId: base.id, version: base.version, job }, { onSuccess: accept, onError: failed }); } }}>{save.isPending ? "Saving…" : "Save"}</Button><Button variant="outline" size="sm" disabled={save.isPending} onClick={() => { setName(""); setNameOpen(true); }}>Save as revision</Button>{calculated && <div className="estimate-job-total"><strong className="estimate-number">{money(calculated.total.sell)}</strong><small className="estimate-number text-muted-foreground">{(calculated.margin * 100).toFixed(2)}% margin · job sell</small></div>}</>}
    </div>
    <ClaudeTakeoff opportunityId={opportunityId} revisionId={base?.id} dirty={dirty} manualPending={save.isPending} onManualStart={ordered.length === 0 && !job ? () => save.mutate({ start: true }, { onSuccess: accept, onError: failed }) : undefined} onOpenRevision={id => {
      // Never navigate away from an in-progress draft to show a generated result.
      if (dirty) { setMessage("Save your draft before opening the generated revision. Your edits are safe."); return; }
      if (id !== selected) { setSelected(id); setJob(undefined); setBase(undefined); setFocus(undefined); }
      setView("takeoff");
    }} onFocus={value => {
      if (!job?.categories.some(c => c.id === value.categoryId || c.items.some(l => l.id === value.lineId))) { setMessage("This flagged line is no longer in the current draft. Check the run summary or reopen the saved revision."); return; }
      setView("takeoff"); setFocus(value);
    }} />
    {message && <p role="status" className="rounded border p-3 text-sm">{message}</p>}
    {ordered.length === 0 && !job && <div className="estimate-panel px-5 py-8 text-center space-y-3"><h3 className="font-semibold text-lg">Start estimate</h3><p className="text-muted-foreground max-w-md mx-auto">Start manually with current company rates using Start Rev 0, choose New Claude takeoff above to measure documents, or import a takeoff file. This estimate does not change the scope checklist or awarded contract.</p><Button disabled={save.isPending} onClick={() => save.mutate({ start: true }, { onSuccess: accept, onError: failed })}>Start Rev 0</Button></div>}
    {selected && loaded.isLoading && !job && <div className="h-48 bg-muted rounded animate-pulse" aria-label="Loading estimate" />}
    {selected && loaded.isError && !job && <div role="alert" className="p-4 border rounded"><p>Could not load revision: {loaded.error.message}</p><Button variant="outline" onClick={() => loaded.refetch()}>Retry</Button></div>}
    {job && base && calculated && <>
      {base.locked && <aside className="border border-amber-500/40 bg-amber-500/5 rounded p-3"><strong>Revision locked</strong><p>{base.lockReason || "This saved revision cannot be overwritten."}</p><p className="text-xs mt-1">You may edit a local draft and use Save as revision.</p></aside>}
      <p className="text-xs text-muted-foreground">Rev {base.revisionNumber} · {base.name || "Unnamed revision"} · saved {new Date(base.savedAt).toLocaleString()} by {base.savedBy}</p>
      {(errors.length > 0 || warnings.length > 0) && <details className={`estimate-panel p-3 ${errors.length ? "text-destructive" : "text-amber-700 dark:text-amber-300"}`} open={errors.length > 0}><summary className="cursor-pointer font-semibold">{errors.length} formula errors · {warnings.length} missing rate warnings · Invalid values count as zero</summary><ul className="list-disc pl-5 mt-2 text-xs space-y-1">{[...errors, ...warnings].map(([key, error]) => {
        let label = key.split(":")[0] === "defaults" ? "Default markups" : "Rates";
        for (const cat of job.categories) for (const line of cat.items) { if (key.startsWith(line.id) || Object.values(line.res).flat().some(row => key.startsWith(row.id))) label = `${cat.name} / ${line.desc || "Untitled line"}`; }
        return <li key={key}>{label}: {error}</li>;
      })}</ul></details>}
      <nav className="estimate-toolbar" aria-label="Estimate views">{[["takeoff", "Takeoff & costs"], ["cover", "Cover sheet"], ["rates", "Estimate-local rates"]].map(([key, title]) => <Button key={key} size="sm" variant={view === key ? "default" : "ghost"} aria-pressed={view === key} onClick={() => setView(key)}>{title}</Button>)}<div className="ml-auto flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => downloadCsv(job)}>Cover CSV</Button><Button size="sm" variant="outline" onClick={() => downloadCsv(job, true)}>Detail CSV</Button></div></nav>
      {view === "takeoff" && <TakeoffEditor key={base.id} job={job} onChange={setJob} focusLineId={focus?.lineId} focusCategoryId={focus?.categoryId} focusSignal={focus?.signal} />}
      {view === "cover" && <EstimateCover job={job} computed={calculated} />}
      {view === "rates" && <div className="space-y-3"><div className="estimate-toolbar"><p className="text-xs text-muted-foreground flex-1">These rates belong to this draft only. Company changes do not alter saved estimates.</p><Button size="sm" variant="outline" onClick={() => setRefreshOpen(true)}>Refresh company rates</Button><Button size="sm" variant="outline" onClick={() => setShareRates(structuredClone({ rates: job.rates, laborRates: job.laborRates, equipRates: job.equipRates, defaults: job.defaults, markupNotes: job.markupNotes }))}>Save as company rates</Button></div><RatesEditor rates={job} onChange={rates => setJob({ ...job, ...rates })} /></div>}
    </>}
    <Dialog open={nameOpen} onOpenChange={setNameOpen}><DialogContent><DialogHeader><DialogTitle>Save as new revision</DialogTitle><DialogDescription>The current saved revision stays unchanged. This draft becomes the newest revision.</DialogDescription></DialogHeader><label className="space-y-2 text-sm">Revision name<input autoFocus className="block w-full border rounded p-2 bg-background" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Updated excavation pricing" maxLength={160} /></label><DialogFooter><Button variant="outline" onClick={() => setNameOpen(false)}>Cancel</Button><Button disabled={save.isPending || !job} onClick={() => { if (job && confirmFormulaSave()) { submitted.current = JSON.stringify(job); save.mutate({ job, name: name.trim() }, { onSuccess: accept, onError: failed }); } }}>Save new revision</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!conflict} onOpenChange={open => { if (!open) setConflict(undefined); }}><DialogContent><DialogHeader><DialogTitle>Revision changed elsewhere</DialogTitle><DialogDescription>Your draft is safe. Load the current saved revision (discarding your edits), or preserve your draft as a new revision.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => { if (conflict && discardEstimate()) accept(conflict); }}>Load current</Button><Button disabled={save.isPending} onClick={() => { setConflict(undefined); setName(""); setNameOpen(true); }}>Save draft as new revision</Button></DialogFooter></DialogContent></Dialog>
    {refreshOpen && job && <RefreshRatesDialog onClose={() => setRefreshOpen(false)} onApply={(rates, replaceDefaultMarkups) => { setJob(refreshRates(job, rates, { replaceDefaultMarkups })); setRefreshOpen(false); setMessage("Company rates refreshed in this draft only. Save when ready."); }} />}
    {shareRates && <RateImportDialog estimateRates={shareRates} onClose={() => setShareRates(undefined)} onApplied={result => setMessage(`Company rates saved · version ${result.version}. This estimate draft and its saved revisions were not changed.`)} />}
  </div>;
}
function RefreshRatesDialog({ onClose, onApply }: { onClose: () => void; onApply: (rates: EstimateRates, replaceDefaultMarkups: boolean) => void }) {
  const query = useEstimatingRates();
  const [replaceDefaultMarkups, setReplaceDefaultMarkups] = useState(false);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent><DialogHeader><DialogTitle>Refresh company rates?</DialogTitle><DialogDescription>Replace matching named rates and labor/equipment rates in this draft. Default markups and manual cost overrides stay unchanged unless you choose otherwise below. Removed types that are still referenced are retained. Saved revisions are not changed until you save.</DialogDescription></DialogHeader>{query.isLoading && <div className="h-16 rounded bg-muted animate-pulse" />}{query.isError && <div role="alert"><p>{query.error.message}</p><Button variant="outline" onClick={() => query.refetch()}>Retry</Button></div>}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={replaceDefaultMarkups} onChange={e => setReplaceDefaultMarkups(e.target.checked)} />Also replace default markups</label><DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!query.data} onClick={() => { if (query.data) onApply(query.data.rates, replaceDefaultMarkups); }}>Refresh draft</Button></DialogFooter></DialogContent></Dialog>;
}
