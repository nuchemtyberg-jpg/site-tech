import { useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTakeoffSettings, type PublicRun } from "@/hooks/use-takeoff";
import { AI_MODELS, aiSettingsSchema, type AISettings } from "@shared/estimating/takeoff";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { useSaveTakeoffSettings } from "./use-takeoff-management";
import { elapsedRun, runStatusLabel, usd } from "./takeoff-helpers";
import "./takeoff-ai.css";

export default function EstimatingAISettings() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <p role="alert">Only administrators can manage Estimating AI.</p>;
  return <div className="takeoff-ai ai-stack"><aside role="note" aria-label="Production readiness warning" className="ai-note"><strong>Production readiness warning</strong><p>Current production uses Autoscale. A Reserved VM or external persistent worker is required before relying on 10–40 minute takeoff runs. Autoscale instances may stop or restart during long-running work.</p><p className="ai-muted">This notice does not change deployment settings.</p></aside><SettingsWorkspace /></div>;
}
function SettingsWorkspace() {
  const query = useTakeoffSettings();
  const save = useSaveTakeoffSettings();
  const [settings, setSettings] = useState<AISettings>();
  const version = useRef<number>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("all");
  const [detail, setDetail] = useState<number>();
  useEffect(() => {
    if (query.data && version.current === undefined) { setSettings(structuredClone(query.data.settings)); version.current = query.data.version; }
  }, [query.data]);
  if (query.isLoading) return <div aria-label="Loading Estimating AI settings" className="space-y-3"><div className="h-24 rounded bg-muted animate-pulse" /><div className="h-64 rounded bg-muted animate-pulse" /></div>;
  if (query.isError) return <div role="alert"><p>{query.error.message}</p><Button variant="outline" onClick={() => query.refetch()}>Retry</Button></div>;
  if (!settings) return null;
  const runs = (query.data?.runs || []).filter(r => status === "all" || r.status === status);
  return <div className="takeoff-ai ai-stack">
    <header className="ai-row"><Settings2 className="h-5 w-5 text-primary" /><div><p className="ai-kicker">Admin settings / estimating</p><h1 className="text-xl font-semibold">Estimating AI</h1></div></header>
    <div className="ai-note ai-row"><div className="mr-auto"><p className="ai-muted">This month · all takeoff runs</p><strong className="text-xl ai-stat">{usd(query.data?.monthSpend || 0)}</strong></div><p className="ai-muted">Limits apply per run. Changing settings does not change an existing run.</p></div>
    {error && <p role="alert" className="ai-error">{error}</p>}{message && <p role="status" className="ai-note">{message}</p>}
    <form className="ai-panel ai-stack" onSubmit={e => {
      e.preventDefault(); setError(""); setMessage("");
      const parsed = aiSettingsSchema.safeParse(settings);
      if (!parsed.success) { setError(parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")); return; }
      save.mutate({ settings: parsed.data, version: version.current! }, {
        onSuccess: () => { version.current = undefined; setMessage("Estimating AI settings saved."); },
        onError: e => setError(e.message),
      });
    }}>
      <h2 className="ai-heading">Run defaults & safety limits</h2><div className="ai-grid"><label className="ai-field">Claude model<select value={settings.model} onChange={e => setSettings({ ...settings, model: e.target.value as AISettings["model"] })}>{AI_MODELS.map(m => <option key={m}>{m}</option>)}</select></label><label className="ai-field">Maximum cost per run (USD)<input type="number" required min={.1} max={10000} step=".01" value={settings.maxCost} onChange={e => setSettings({ ...settings, maxCost: Number(e.target.value) })} /></label><label className="ai-field">Maximum steps per run<input type="number" required min={1} max={1000} step={1} value={settings.maxSteps} onChange={e => setSettings({ ...settings, maxSteps: Number(e.target.value) })} /></label></div>
      <h2 className="ai-heading mt-2">Model pricing · USD per million tokens</h2><p className="ai-muted">Keep these aligned with your provider pricing. Cost tracking uses the run’s saved settings.</p>
      {AI_MODELS.map(model => <fieldset key={model} className="ai-file"><legend className="px-1 font-medium text-xs">{model}</legend><div className="ai-grid">{(["input", "output", "cacheRead", "cacheWrite"] as const).map(key => <label key={key} className="ai-field">{{ input: "Input", output: "Output", cacheRead: "Cache read", cacheWrite: "Cache write" }[key]}<input type="number" required min={key === "cacheRead" ? 0 : .000001} step="any" value={settings.prices[model][key]} onChange={e => setSettings({ ...settings, prices: { ...settings.prices, [model]: { ...settings.prices[model], [key]: Number(e.target.value) } } })} /></label>)}</div></fieldset>)}
      <div className="ai-row justify-end"><Button size="sm" variant="outline" type="button" disabled={save.isPending} onClick={() => { if (query.data && window.confirm("Discard local settings edits and reload the current saved settings?")) { version.current = undefined; setSettings(structuredClone(query.data.settings)); version.current = query.data.version; void query.refetch().then(result => { if (result.data) { setSettings(structuredClone(result.data.settings)); version.current = result.data.version; } }); } }}>Reload saved settings</Button><Button size="sm" disabled={save.isPending} type="submit">{save.isPending ? "Saving…" : "Save settings"}</Button></div>
    </form>
    <section className="ai-panel ai-stack"><div className="ai-row"><h2 className="ai-heading mr-auto">All takeoff runs</h2><label className="ai-field">Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option>{(["queued", "running", "needs_review", "stopped_at_cap", "completed", "failed", "cancelled"] as const).map(s => <option key={s} value={s}>{runStatusLabel(s)}</option>)}</select></label><Button size="sm" variant="outline" onClick={() => query.refetch()}>Refresh runs</Button></div>
      {!runs.length && <div className="ai-note"><strong>No runs to show</strong><p className="ai-muted">Runs appear here after an estimator starts a Claude takeoff.</p></div>}
      {runs.map(run => <article className="ai-file ai-stack" key={run.id}><div className="ai-row"><div className="mr-auto"><strong>Run #{run.id} · {runStatusLabel(run.status)}</strong><p className="ai-muted">{new Date(run.createdAt).toLocaleString()} · {run.createdBy}</p></div><span className="ai-stat">{usd(run.cost)} · {run.steps} steps · {elapsedRun(run)}</span><Button variant="ghost" size="sm" aria-expanded={detail === run.id} onClick={() => setDetail(detail === run.id ? undefined : run.id)}>Details</Button><Link href={`/bidding/${run.opportunityId}?tab=estimate`} className="text-primary underline text-xs">Open opportunity</Link></div>{detail === run.id && <RunFacts run={run} />}</article>)}
    </section>
  </div>;
}
export function RunFacts({ run }: { run: PublicRun }) {
  return <div className="ai-stack text-xs"><p className="ai-muted">{run.model} · playbook {run.playbookVersion} · revision {run.revisionId ?? "not created"} · budget {usd(run.budget)} · step limit {run.stepLimit}</p><p>{run.documents.map(d => `${d.name} (${d.pages.length} pages)`).join("; ") || "No documents"}</p><p className="ai-muted">Trades: {run.trades.join(", ") || "All applicable trades"} · Tokens: {run.usage.input.toLocaleString()} input / {run.usage.output.toLocaleString()} output / {run.usage.cacheRead.toLocaleString()} cache read / {run.usage.cacheWrite.toLocaleString()} cache write</p>{run.instructions && <p className="ai-prose">Instructions: {run.instructions}</p>}{run.error && <p role="alert" className="ai-error">{run.error}</p>}<ol className="space-y-1">{run.progress.map((p, index) => <li key={index}><time className="ai-muted mr-2">{new Date(p.at).toLocaleTimeString()}</time>{p.message}</li>)}</ol></div>;
}
