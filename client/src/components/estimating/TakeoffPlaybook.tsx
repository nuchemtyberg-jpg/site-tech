import { useEffect, useRef, useState } from "react";
import { BookOpen, History, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTakeoffPlaybook, type PlaybookVersion } from "@/hooks/use-takeoff";
import { learnedRuleSchema, TRADES, type LearnedRule } from "@shared/estimating/takeoff";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSaveLearnedRule, useSavePlaybook } from "./use-takeoff-management";
import "./takeoff-ai.css";

export default function TakeoffPlaybook() {
  const { canEstimate } = useAuth();
  if (!canEstimate) return <div role="alert">Estimating access is required to view the takeoff playbook.</div>;
  return <PlaybookWorkspace />;
}
function PlaybookWorkspace() {
  const { canEstimate } = useAuth();
  const query = useTakeoffPlaybook();
  const save = useSavePlaybook();
  const ruleSave = useSaveLearnedRule();
  const [markdown, setMarkdown] = useState("");
  const [saved, setSaved] = useState("");
  const initialized = useRef(false);
  const [history, setHistory] = useState(false);
  const [preview, setPreview] = useState<PlaybookVersion>();
  const [rule, setRule] = useState<Partial<LearnedRule>>();
  const [filter, setFilter] = useState("All rules");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const versions = [...(query.data?.versions || [])].sort((a, b) => b.id - a.id);
  useEffect(() => {
    if (query.data && !initialized.current) {
      const newest = [...query.data.versions].sort((a, b) => b.id - a.id)[0];
      setMarkdown(newest?.markdown || ""); setSaved(newest?.markdown || ""); initialized.current = true;
    }
  }, [query.data]);
  useEffect(() => {
    if (markdown === saved) return;
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [markdown, saved]);
  const persist = (text: string, restoredFrom?: number) => {
    setError(""); setMessage("");
    save.mutate({ markdown: text, ...(restoredFrom ? { restoredFrom } : {}) }, {
      onSuccess: () => { setSaved(text); if (restoredFrom) setMarkdown(text); setMessage(restoredFrom ? `Version ${restoredFrom} restored as a new version.` : "Playbook saved as a new version."); setPreview(undefined); },
      onError: e => setError(e.message),
    });
  };
  if (query.isLoading) return <div className="space-y-3" aria-label="Loading takeoff playbook"><div className="h-20 bg-muted animate-pulse rounded" /><div className="h-64 bg-muted animate-pulse rounded" /></div>;
  if (query.isError) return <div role="alert"><p>{query.error.message}</p><Button variant="outline" onClick={() => query.refetch()}>Retry</Button></div>;
  const rules = (query.data?.rules || []).filter(r => filter === "All rules" || (filter === "Active" ? r.active : !r.active));
  return <div className="takeoff-ai ai-stack pt-14 md:pt-0">
    <header className="ai-row"><BookOpen className="h-5 w-5 text-primary" /><div className="mr-auto"><p className="ai-kicker">Estimating / shared knowledge</p><h1 className="text-xl font-semibold">Takeoff Playbook</h1></div><Button variant="outline" size="sm" onClick={() => setHistory(!history)}><History className="h-4 w-4 mr-2" />Version history</Button></header>
    <p className="ai-muted">Company methods for SOE, structural piles, excavation and site work. New runs snapshot the current playbook and active learned rules.</p>
    {error && <p role="alert" className="ai-error">{error}</p>}{message && <p role="status" className="ai-note">{message}</p>}
    <section className="ai-panel ai-stack"><div className="ai-row"><h2 className="ai-heading mr-auto">Company playbook</h2><span className="ai-muted">{versions.length ? `Version ${versions[0].id} · ${new Date(versions[0].createdAt).toLocaleString()}` : "No versions yet"}</span></div>
      <label className="ai-field">Instructions in Markdown<textarea rows={17} placeholder="Paste the playbook here" value={markdown} disabled={!canEstimate || save.isPending} onChange={e => setMarkdown(e.target.value)} /></label>
      <div className="ai-row"><p className="ai-muted mr-auto">{markdown !== saved ? "Unsaved changes" : "Every save creates an immutable version."}</p>{canEstimate && <Button size="sm" disabled={save.isPending || markdown === saved || !markdown.trim()} onClick={() => persist(markdown)}>{save.isPending ? "Saving…" : "Save new version"}</Button>}</div>
    </section>
    {history && <section className="ai-panel ai-stack"><h2 className="ai-heading">Version history</h2>{!versions.length && <p className="ai-muted">Save the first playbook to begin its history.</p>}{versions.map(v => <div key={v.id} className="ai-row border-b pb-2"><span className="mr-auto min-w-0">Version {v.id} · {new Date(v.createdAt).toLocaleString()}<span className="ai-muted block">By {v.createdBy}{v.restoredFrom ? ` · restored from ${v.restoredFrom}` : ""}</span></span><Button size="sm" variant="outline" onClick={() => setPreview(v)}>View / restore</Button></div>)}</section>}
    <section className="ai-panel ai-stack"><div className="ai-row"><div className="mr-auto"><h2 className="ai-heading">Learned rules</h2><p className="ai-muted">Keep corrections explicit, scoped and traceable.</p></div><label className="ai-field">Show<select value={filter} onChange={e => setFilter(e.target.value)}>{["All rules", "Active", "Inactive"].map(s => <option key={s}>{s}</option>)}</select></label>{canEstimate && <Button size="sm" variant="outline" onClick={() => { setRule({ text: "", appliesTo: "All", active: true, sourceNote: "" }); setError(""); }}><Plus size={14} className="mr-1" />Add rule</Button>}</div>
      {!rules.length && <div className="ai-note"><strong>No {filter === "All rules" ? "" : filter.toLowerCase() + " "}rules yet</strong><p className="ai-muted">Add a field correction or pricing convention for future takeoffs.</p></div>}
      {rules.map(r => <article key={r.id} className="ai-file ai-stack"><div className="ai-row"><strong className="mr-auto">{r.appliesTo} <span className="ai-muted">· {r.active ? "Active" : "Inactive"}</span></strong>{canEstimate && <><Button variant="ghost" size="sm" disabled={ruleSave.isPending} onClick={() => setRule({ ...r })}>Edit rule</Button><Button variant="outline" size="sm" disabled={ruleSave.isPending} onClick={() => ruleSave.mutate({ ...r, active: !r.active }, { onError: e => setError(e.message) })}>{r.active ? "Deactivate" : "Activate"}</Button></>}</div><p className="ai-prose">{r.text}</p>{r.sourceNote && <p className="ai-muted">Source: {r.sourceNote}</p>}<p className="ai-muted">Added by {r.addedBy} · {new Date(r.createdAt).toLocaleDateString()}</p></article>)}
    </section>
    <Dialog open={!!preview} onOpenChange={open => { if (!open) setPreview(undefined); }}><DialogContent className="takeoff-ai takeoff-ai-dialog"><DialogHeader><DialogTitle>Playbook version {preview?.id}</DialogTitle><DialogDescription>Restoring creates a new version; history is never overwritten.</DialogDescription></DialogHeader><pre className="ai-prose">{preview?.markdown}</pre><DialogFooter><Button variant="outline" onClick={() => setPreview(undefined)}>Close</Button>{canEstimate && <Button disabled={save.isPending} onClick={() => { if (preview && (markdown === saved || window.confirm("Replace your unsaved playbook draft with this version?"))) persist(preview.markdown, preview.id); }}>Restore as new version</Button>}</DialogFooter></DialogContent></Dialog>
    <Dialog open={!!rule} onOpenChange={open => { if (!open) setRule(undefined); }}><DialogContent className="takeoff-ai takeoff-ai-dialog"><DialogHeader><DialogTitle>{rule?.id ? "Edit learned rule" : "Add learned rule"}</DialogTitle><DialogDescription>Active rules are included in future takeoffs only.</DialogDescription></DialogHeader>{rule && <form className="ai-stack" onSubmit={e => {
      e.preventDefault(); const parsed = learnedRuleSchema.safeParse(rule);
      if (!parsed.success) { setError(parsed.error.issues.map(i => i.message).join("; ")); return; }
      setError(""); ruleSave.mutate({ id: rule.id, ...parsed.data }, { onSuccess: () => setRule(undefined), onError: e => setError(e.message) });
    }}><label className="ai-field">Rule<textarea required maxLength={10000} rows={5} value={rule.text || ""} onChange={e => setRule({ ...rule, text: e.target.value })} /></label><label className="ai-field">Applies to<input list="rule-trades" required maxLength={100} value={rule.appliesTo || ""} onChange={e => setRule({ ...rule, appliesTo: e.target.value })} /><datalist id="rule-trades">{["All", ...TRADES].map(t => <option key={t} value={t} />)}</datalist><span className="ai-muted">Choose All, a trade, or enter a custom scope.</span></label><label className="ai-field">Source note<textarea maxLength={2000} rows={2} value={rule.sourceNote || ""} onChange={e => setRule({ ...rule, sourceNote: e.target.value })} /></label><label className="ai-row"><input type="checkbox" checked={!!rule.active} onChange={e => setRule({ ...rule, active: e.target.checked })} />Active for new runs</label>{error && <p role="alert" className="ai-error">{error}</p>}<DialogFooter><Button type="button" variant="outline" onClick={() => setRule(undefined)}>Cancel</Button><Button disabled={ruleSave.isPending} type="submit">Save rule</Button></DialogFooter></form>}</DialogContent></Dialog>
  </div>;
}
