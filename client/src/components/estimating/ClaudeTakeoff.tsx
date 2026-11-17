import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTakeoffAction, useTakeoffRuns, type PublicRun } from "@/hooks/use-takeoff";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TakeoffWizard } from "./TakeoffWizard";
import { RunFacts } from "./EstimatingAISettings";
import { elapsedRun, runStatusLabel, usd } from "./takeoff-helpers";
import "./takeoff-ai.css";

export interface TakeoffFocus { lineId: string; categoryId: string; signal: number }
export interface ClaudeTakeoffProps { opportunityId: number; revisionId?: number; dirty: boolean; onOpenRevision: (id: number) => void; onFocus: (focus: TakeoffFocus) => void; onManualStart?: () => void; manualPending?: boolean }
export function ClaudeTakeoff(props: ClaudeTakeoffProps) {
  const { canEstimate } = useAuth();
  if (!canEstimate) return null;
  return <ClaudeWorkspace {...props} />;
}
function ClaudeWorkspace({ opportunityId, revisionId, dirty, onOpenRevision, onFocus, onManualStart, manualPending }: ClaudeTakeoffProps) {
  const runs = useTakeoffRuns(opportunityId);
  const [wizard, setWizard] = useState(false);
  const [started, setStarted] = useState<number>();
  const [choose, setChoose] = useState(false);
  const handled = useRef(new Set<number>());
  const callback = useRef(onOpenRevision); callback.current = onOpenRevision;
  const ordered = [...(runs.data || [])].sort((a, b) => b.id - a.id);
  const review = ordered.find(r => r.revisionId === revisionId);
  useEffect(() => {
    const completed = runs.data?.find(r => r.id === started && r.revisionId && (r.status === "needs_review" || r.status === "completed"));
    if (!completed || !completed.revisionId || handled.current.has(completed.id) || dirty) return;
    handled.current.add(completed.id); callback.current(completed.revisionId);
  }, [runs.data, started, dirty]);
  return <div className="takeoff-ai ai-stack">
    <div className="ai-row"><span className="ai-muted mr-auto">Claude takeoff · source-linked quantities, estimator-reviewed pricing</span>{onManualStart && <Button size="sm" onClick={() => setChoose(true)}>Start estimate</Button>}<Button size="sm" variant="outline" onClick={() => setWizard(true)}><Sparkles size={14} className="mr-1" />New Claude takeoff</Button></div>
    {runs.isLoading && <div aria-label="Loading Claude runs" className="h-12 bg-muted rounded animate-pulse" />}
    {runs.isError && <div className="ai-error" role="alert">Could not load Claude takeoffs: {runs.error.message}<Button size="sm" variant="outline" onClick={() => runs.refetch()}>Retry runs</Button></div>}
    {review && <TakeoffReview run={review} opportunityId={opportunityId} onFocus={onFocus} />}
    {ordered.length > 0 && <details open={ordered.some(r => ["queued", "running", "stopped_at_cap"].includes(r.status)) || !!started}><summary className="cursor-pointer text-xs font-medium py-1">Claude runs ({ordered.length})</summary><div className="ai-stack mt-2">{ordered.map(run => <RunProgress key={run.id} run={run} opportunityId={opportunityId} dirty={dirty} selected={revisionId === run.revisionId} onOpenRevision={onOpenRevision} />)}</div></details>}
    {wizard && <TakeoffWizard opportunityId={opportunityId} revisionId={revisionId} dirty={dirty} onClose={() => setWizard(false)} onStarted={setStarted} />}
    <Dialog open={choose} onOpenChange={setChoose}><DialogContent className="takeoff-ai takeoff-ai-dialog"><DialogHeader><DialogTitle>Start estimate</DialogTitle><DialogDescription>Choose how to build the first takeoff. Both options use current company rates and keep the scope checklist unchanged.</DialogDescription></DialogHeader><div className="ai-grid"><div className="ai-file ai-stack"><h3 className="ai-heading">Start manually</h3><p className="ai-muted">Create Revision 0 and enter quantities, resources and pricing yourself.</p><Button disabled={manualPending} onClick={() => { setChoose(false); onManualStart?.(); }}>Start manual estimate</Button></div><div className="ai-file ai-stack"><h3 className="ai-heading">Take off with Claude</h3><p className="ai-muted">Select drawings and scope. Approve a spending cap, then review the generated revision.</p><Button variant="outline" onClick={() => { setChoose(false); setWizard(true); }}>Set up Claude takeoff</Button></div></div></DialogContent></Dialog>
  </div>;
}
export function RunProgress({ run, opportunityId, dirty, selected, onOpenRevision }: { run: PublicRun; opportunityId: number; dirty: boolean; selected: boolean; onOpenRevision: (id: number) => void }) {
  const action = useTakeoffAction(opportunityId);
  const [error, setError] = useState("");
  const [continueOpen, setContinueOpen] = useState(false);
  const [budget, setBudget] = useState("10");
  const [steps, setSteps] = useState("50");
  const [approved, setApproved] = useState(false);
  const [, tick] = useState(0);
  const live = run.status === "queued" || run.status === "running";
  useEffect(() => { if (!live) return; const timer = window.setInterval(() => tick(n => n + 1), 1000); return () => window.clearInterval(timer); }, [live]);
  const perform = (suffix: string, data?: unknown) => {
    setError("");
    action.mutate({ action: `runs/${run.id}/${suffix}`, data }, { onSuccess: () => { setContinueOpen(false); setApproved(false); }, onError: e => setError(e.message) });
  };
  return <article className="ai-panel ai-stack">
    <div className="ai-row"><strong className="mr-auto">Run #{run.id} · {runStatusLabel(run.status)}</strong><span className="ai-stat text-xs">{usd(run.cost)} / {usd(run.budget)} · {run.steps} / {run.stepLimit} steps · {elapsedRun(run)}</span></div>
    <p role={live ? "status" : undefined}>{run.progress[run.progress.length - 1]?.message || (run.status === "queued" ? "Waiting to start…" : runStatusLabel(run.status))}</p>
    {run.error && <p className="ai-error" role="alert">{run.error}</p>}{error && <p className="ai-error" role="alert">{error}</p>}
    <div className="ai-row">
      {live && <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => { if (window.confirm("Cancel this takeoff? Already incurred costs still apply.")) perform("cancel"); }}>Cancel takeoff</Button>}
      {run.status === "stopped_at_cap" && <Button size="sm" disabled={action.isPending} onClick={() => { setContinueOpen(true); setApproved(false); }}>Approve more budget & continue</Button>}
      {run.revisionId && <Button size="sm" variant="outline" disabled={selected || dirty} onClick={() => onOpenRevision(run.revisionId!)}>{selected ? "Revision open" : "Open generated revision"}</Button>}
      {run.revisionId && dirty && !selected && <p className="ai-muted">Save your draft before opening this revision. Your edits have not been discarded.</p>}
      <details className="min-w-0 w-full"><summary className="cursor-pointer ai-muted">Run facts & activity</summary><div className="mt-2"><RunFacts run={run} /></div></details>
    </div>
    <Dialog open={continueOpen} onOpenChange={open => { if (!action.isPending) setContinueOpen(open); }}><DialogContent className="takeoff-ai takeoff-ai-dialog"><DialogHeader><DialogTitle>Approve additional spending</DialogTitle><DialogDescription>This increases this run’s limits. Existing spend is not reset.</DialogDescription></DialogHeader><div className="ai-stack"><p className="ai-muted">Spent {usd(run.cost)} of {usd(run.budget)} · {run.steps} of {run.stepLimit} steps.</p><div className="ai-grid"><label className="ai-field">Additional budget (USD)<input type="number" min=".1" max="10000" step=".01" value={budget} onChange={e => { setBudget(e.target.value); setApproved(false); }} /></label><label className="ai-field">Additional steps<input type="number" min="1" max="1000" step="1" value={steps} onChange={e => { setSteps(e.target.value); setApproved(false); }} /></label></div><p className="ai-note">New total budget: {usd(run.budget + (Number(budget) || 0))} · new step limit: {run.stepLimit + (Number(steps) || 0)}</p><label className="ai-row"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} />I approve the additional spending shown above.</label>{error && <p role="alert" className="ai-error">{error}</p>}<DialogFooter><Button variant="outline" disabled={action.isPending} onClick={() => setContinueOpen(false)}>Cancel</Button><Button disabled={action.isPending || !approved || !Number.isFinite(Number(budget)) || Number(budget) < .1 || Number(budget) > 10000 || !Number.isInteger(Number(steps)) || Number(steps) < 1 || Number(steps) > 1000} onClick={() => perform("continue", { additionalBudget: Number(budget), additionalSteps: Number(steps) })}>{action.isPending ? "Continuing…" : "Approve & continue"}</Button></DialogFooter></div></DialogContent></Dialog>
  </article>;
}
export function TakeoffReview({ run, opportunityId, onFocus }: { run: PublicRun; opportunityId: number; onFocus: (focus: TakeoffFocus) => void }) {
  const action = useTakeoffAction(opportunityId);
  const [copy, setCopy] = useState("");
  const [error, setError] = useState("");
  const flagsByType = run.flags.reduce<Record<string, PublicRun["flags"]>>((groups, flag) => {
    (groups[flag.type] ||= []).push(flag);
    return groups;
  }, Object.create(null));
  return <section className="ai-panel ai-stack border-primary/30" aria-label="Claude takeoff review"><div className="ai-row"><div className="mr-auto"><p className="ai-kicker">Review required before use</p><h3 className="ai-heading">Claude takeoff · run #{run.id}</h3></div><span className="ai-muted">{runStatusLabel(run.status)}</span></div>
    {run.summary && <p className="ai-prose">{run.summary}</p>}
    <div className="ai-file ai-stack"><p className="text-xs"><strong>Model:</strong> {run.model}</p><div><h4 className="font-semibold text-xs">Documents & pages used</h4>{run.documents.length ? <ul className="mt-1 space-y-2 text-xs">{run.documents.map((document, index) => <li key={`${document.fileId}-${index}`}><strong>{document.name}</strong><span className="block ai-muted">Pages / sheets: {document.pages.join(", ")} · {document.pages.length} selected</span></li>)}</ul> : <p className="ai-muted">No source documents recorded for this run.</p>}</div></div>
    <p className="ai-muted">{run.flags.length} flags · {run.questions.length} questions · {usd(run.cost)} · {run.steps} steps · {elapsedRun(run)} · playbook {run.playbookVersion}</p>
    {run.flags.length > 0 && <div className="ai-stack"><h4 className="font-semibold text-xs">Check these quantities & assumptions</h4>{Object.entries(flagsByType).map(([type, flags]) => <section key={type} className="ai-stack" aria-label={`${type} flags`}><h5 className="font-semibold text-xs">{type} ({flags.length})</h5>{flags.map((flag, i) => <button key={i} className="ai-flag" onClick={() => onFocus({ lineId: flag.lineId, categoryId: flag.categoryId, signal: Date.now() })}><strong className="text-xs">{flag.type} · {flag.flag}</strong><span className="block text-xs mt-1">{flag.description}</span><span className="ai-muted">Open corresponding takeoff {flag.lineId ? "line" : "category"}</span></button>)}</section>)}</div>}
    {run.questions.length > 0 && <div className="ai-stack"><div className="ai-row"><h4 className="font-semibold text-xs mr-auto">Questions for the project team</h4><Button size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(run.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")); setCopy("Questions copied."); } catch { setCopy("Clipboard unavailable. Select and copy the questions below."); } }}>Copy questions</Button></div><ol className="list-decimal pl-5 space-y-1 text-xs select-text">{run.questions.map((q, i) => <li key={i}>{q}</li>)}</ol>{copy && <p role="status" className="ai-muted">{copy}</p>}</div>}
    {error && <p role="alert" className="ai-error">{error}</p>}
    {run.status === "needs_review" && <div className="ai-row"><p className="ai-muted mr-auto">Review the scope, rates and flagged lines. This does not lock or approve the estimate.</p><Button size="sm" disabled={action.isPending} onClick={() => { if (window.confirm("Mark this takeoff reviewed? Confirm you checked quantities, assumptions and questions.")) { setError(""); action.mutate({ action: `runs/${run.id}/review` }, { onError: e => setError(e.message) }); } }}>{action.isPending ? "Saving review…" : "Mark takeoff reviewed"}</Button></div>}
  </section>;
}
