import { useEffect, useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { useTakeoffAction, useTakeoffDocuments, takeoffRoot, type TakeoffDocument } from "@/hooks/use-takeoff";
import { TRADES } from "@shared/estimating/takeoff";
import { NativeFileUploader, type UploadResult } from "@/components/NativeFileUploader";
import { createRegistrationSession } from "@/components/documents/document-uploads";
import { documentToolsBase, useDocumentTools } from "@/components/documents/use-document-tools";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTakeoffConfig, useTakeoffSheets } from "./use-takeoff-management";
import { estimateTakeoffUsage, usd } from "./takeoff-helpers";
import "./takeoff-ai.css";

export function TakeoffWizard({ opportunityId, revisionId, dirty, onClose, onStarted }: { opportunityId: number; revisionId?: number; dirty: boolean; onClose: () => void; onStarted: (id: number) => void }) {
  const documents = useTakeoffDocuments(opportunityId);
  const config = useTakeoffConfig(opportunityId);
  const action = useTakeoffAction(opportunityId);
  const tools = useDocumentTools("opportunity", opportunityId);
  const toolsRef = useRef(tools); toolsRef.current = tools;
  const registration = useRef<ReturnType<typeof createRegistrationSession>>();
  if (!registration.current) registration.current = createRegistrationSession({
    base: documentToolsBase("opportunity", opportunityId), folderId: null, getFolders: () => toolsRef.current.folders.data || [],
    createFolder: data => toolsRef.current.createFolder.mutateAsync(data),
    createFile: data => toolsRef.current.createFile.mutateAsync(data),
  });
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<Record<number, number[]>>({});
  const [instructions, setInstructions] = useState("");
  const [trades, setTrades] = useState<string[]>([]);
  const [customTrade, setCustomTrade] = useState("");
  const [error, setError] = useState("");
  const [approved, setApproved] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(() => { setApproved(false); }, [config.data?.maxCost, config.data?.maxSteps, config.data?.model]);
  const startLock = useRef(false);
  const requestKey = useRef(crypto.randomUUID());
  const selections = Object.entries(selected).filter(([, pages]) => pages.length).map(([fileId, pages]) => ({ fileId: Number(fileId), pages }));
  const count = selections.reduce((n, d) => n + d.pages.length, 0);
  const estimate = config.data ? estimateTakeoffUsage(count, config.data) : undefined;
  function addCustomTrade() {
    const trimmed = customTrade.trim();
    const trade = TRADES.find(t => t.toLowerCase() === trimmed.toLowerCase()) || trimmed;
    if (!trade) return;
    if (!trades.some(t => t.toLowerCase() === trade.toLowerCase())) setTrades(previous => [...previous, trade]);
    setCustomTrade("");
  }
  async function registerUploads(files: UploadResult[]) {
    setError(""); setUploading(true);
    try { await registration.current!.register(files); await documents.refetch(); }
    catch (e) { setError(`Could not save uploaded documents: ${(e as Error).message}. Retry registration in the uploader; successful files will not be duplicated.`); throw e; }
    finally { setUploading(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !action.isPending && !uploading) onClose(); }}><DialogContent className="takeoff-ai takeoff-ai-dialog"><DialogHeader><DialogTitle>New Claude takeoff</DialogTitle><DialogDescription>Prepare source sheets, define scope, then approve a new estimate revision.</DialogDescription></DialogHeader>
    <div className="ai-stack">
      <ol className="ai-steps" aria-label="Takeoff setup progress">{["Documents", "Scope & instructions", "Review & start"].map((title, i) => <li key={title} aria-current={step === i + 1 ? "step" : undefined}>{i + 1}. {title}</li>)}</ol>
      {error && <p className="ai-error" role="alert">{error}</p>}
      {step === 1 && <>
        <div className="ai-row"><div className="mr-auto"><h3 className="ai-heading">Select documents & pages</h3><p className="ai-muted">PDF, PNG, JPG, JPEG, WEBP, XLSX and CSV · up to 30 documents, 500 pages each</p></div><NativeFileUploader accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.csv" maxNumberOfFiles={30} uploadTarget="object-storage" registrationMode="per-file" onUploadComplete={registerUploads} buttonVariant="outline" buttonSize="sm"><Upload className="h-4 w-4 mr-1" />Upload documents</NativeFileUploader><Button size="sm" variant="ghost" onClick={() => documents.refetch()}>Reload list</Button></div>
        <p className="ai-muted">Uploads are saved to this opportunity’s Documents before this list refreshes.</p>
        {documents.isLoading && <div aria-label="Loading documents" className="h-32 rounded bg-muted animate-pulse" />}
        {documents.isError && <div role="alert" className="ai-error">{documents.error.message}<Button variant="outline" size="sm" onClick={() => documents.refetch()}>Retry documents</Button></div>}
        {documents.data?.length === 0 && <div className="ai-note"><FileText className="h-5 w-5 mb-2" /><strong>No supported documents yet</strong><p className="ai-muted">Upload the drawings, geotechnical report or quantity schedule for this takeoff.</p></div>}
        {documents.data?.map(doc => <DocumentPicker key={doc.id} opportunityId={opportunityId} doc={doc} pages={selected[doc.id]} disabled={selections.length >= 30 && !selected[doc.id]} onChange={pages => setSelected(previous => { const next = { ...previous }; if (pages === undefined) delete next[doc.id]; else next[doc.id] = pages; return next; })} />)}
      </>}
      {step === 2 && <>
        <h3 className="ai-heading">What should Claude take off?</h3><fieldset className="ai-stack"><legend className="text-xs mb-2">Trades · optional, leave empty for all applicable trades</legend><div className="ai-row">{TRADES.map(trade => <label className="ai-file ai-row" key={trade}><input type="checkbox" checked={trades.includes(trade)} onChange={e => setTrades(previous => e.target.checked ? [...previous, trade] : previous.filter(t => t !== trade))} />{trade}</label>)}</div></fieldset>
        <div className="ai-stack"><div className="ai-row items-end"><label className="ai-field flex-1">Custom trade<input maxLength={100} value={customTrade} onChange={e => setCustomTrade(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomTrade(); } }} placeholder="e.g. Marine access" /></label><Button size="sm" variant="outline" disabled={!customTrade.trim()} onClick={addCustomTrade}>Add trade</Button></div><p className="ai-muted">Use the same trade name as a learned rule’s custom “Applies to” scope to include that rule.</p><div className="ai-row">{trades.filter(t => !(TRADES as readonly string[]).includes(t)).map(trade => <span className="ai-file ai-row" key={trade}>{trade}<Button size="sm" variant="ghost" aria-label={`Remove custom trade ${trade}`} onClick={() => setTrades(previous => previous.filter(t => t !== trade))}>Remove</Button></span>)}</div>{customTrade.trim() && <p role="status" className="ai-muted">Choose Add trade to include this custom trade.</p>}</div>
        <label className="ai-field">Additional instructions<textarea rows={7} maxLength={20000} value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="For example: use the north property line detail for SOE; separate rock excavation and flag missing elevations." /><span className="ai-muted">{instructions.length.toLocaleString()} / 20,000 characters</span></label>
        <div className="ai-note"><strong>Saved rates, not unsaved edits</strong><p className="ai-muted">{revisionId ? `The current saved revision (#${revisionId}) supplies the rate snapshot.` : "Current company rates supply the initial rate snapshot."} Claude always creates a new revision and never overwrites the existing one.{dirty ? " Your unsaved draft remains open and is not included." : ""}</p></div>
      </>}
      {step === 3 && <>
        <h3 className="ai-heading">Review before starting</h3><div className="ai-file ai-stack">{selections.map(s => <p key={s.fileId}><strong>{documents.data?.find(d => d.id === s.fileId)?.name}</strong><span className="ai-muted block">Pages / sheets: {s.pages.join(", ")}</span></p>)}<p className="ai-muted">{count} selected pages / sheets · {trades.join(", ") || "All applicable trades"}</p>{instructions && <p className="ai-prose">{instructions}</p>}</div>
        {config.isLoading && <div aria-label="Loading takeoff limits" className="h-20 rounded bg-muted animate-pulse" />}
        {config.isError && <div className="ai-error" role="alert">{config.error.message}<Button size="sm" variant="outline" onClick={() => config.refetch()}>Retry limits</Button></div>}
        {config.data && estimate && <div className="ai-note ai-stack"><p className="font-semibold">{config.data.model}{config.data.mode === "single" ? " · single request" : config.data.mode === "sectioned" ? " · sectioned, parallel" : ""}</p>{estimate.low !== null && estimate.high !== null ? <p className="ai-stat">Approximate planning range: {usd(estimate.low)} – {usd(estimate.high)}</p> : <p className="ai-muted">Cost range unavailable: selected-model pricing was not provided. The run cost cap still applies.</p>}{config.data.mode === "single" ? <p className="ai-muted">Estimate only, not a quote. Single-call mode sends the selected pages to Claude once (about {estimate.inputTokens.toLocaleString()} input tokens) and gets the full takeoff back in one response.</p> : config.data.mode === "sectioned" ? <p className="ai-muted">Estimate only, not a quote. Sectioned mode has a low-cost model sort the sheets into scope sections, then estimates the sections in parallel. General notes sheets are sent with every section.</p> : <p className="ai-muted">Estimate only, not a quote. Assumes 40–120 tool steps, approximately {estimate.inputTokens.toLocaleString()}–{(estimate.inputTokens*2).toLocaleString()} cached prompt tokens per step, 3,000–10,000 fresh input tokens and 2,500–6,000 output tokens per step, plus an initial cache write. Uses this model’s configured input, output and cache prices. Cache expiry, complex drawings and retries can increase cost. This estimates the work, not a guarantee of completion within the cap.</p>}<p>Run cost cap: <strong>{usd(config.data.maxCost)}</strong> · step cap: <strong>{config.data.maxSteps}</strong></p><p className="ai-muted">The configured cost cap, not this estimate, controls the run. Continuing at a cap requires another explicit spending approval.</p></div>}
        <p className="ai-muted">A new revision will use {revisionId ? `saved revision #${revisionId} rates` : "company rates"}. Unsaved edits are not used. Review quantities, assumptions and flags before relying on the result.</p>
        <label className="ai-row items-start"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} className="mt-1" /><span>I approve spending up to {config.data ? usd(config.data.maxCost) : "the configured limit"} for this takeoff.</span></label>
      </>}
      <div className="ai-row border-t pt-3"><span className="ai-muted mr-auto">{count} pages / sheets selected</span><Button size="sm" variant="outline" disabled={action.isPending || uploading} onClick={() => step === 1 ? onClose() : setStep(step - 1)}>{step === 1 ? "Cancel" : "Back"}</Button>{step < 3 ? <Button size="sm" disabled={!count || uploading || selections.length > 30} onClick={() => setStep(step + 1)}>Continue</Button> : <Button size="sm" disabled={!approved || !config.data || action.isPending || !count} onClick={() => {
        if (startLock.current || !config.data || !approved) return; startLock.current = true; setError("");
        action.mutate({ action: "runs", data: { requestKey:requestKey.current, documents: selections, instructions, trades, approvedBudget: config.data.maxCost, approvedSteps: config.data.maxSteps, ...(revisionId ? { revisionId } : {}) } }, { onSuccess: run => { onStarted(run.id); onClose(); }, onError: e => { startLock.current = false; setError(e.message); } });
      }}>{action.isPending ? "Starting…" : "Start Claude takeoff"}</Button>}</div>
    </div>
  </DialogContent></Dialog>;
}
function DocumentPicker({ opportunityId, doc, pages, disabled, onChange }: { opportunityId: number; doc: TakeoffDocument; pages?: number[]; disabled: boolean; onChange: (pages: number[] | undefined) => void }) {
  const selected = pages !== undefined;
  const sheets = useTakeoffSheets(opportunityId, doc.id, selected);
  return <div className="ai-file"><label className="ai-row"><input type="checkbox" checked={selected} disabled={disabled} onChange={e => onChange(e.target.checked ? [] : undefined)} /><strong className="min-w-0 flex-1">{doc.name}</strong><span className="ai-muted">{doc.source}</span></label>
    {selected && <>
      {["queued","processing"].includes(sheets.data?.status||"") && <p role="status" className="ai-muted">Preparing document safely in a separate worker. Pages appear as they finish; this may take a few minutes.</p>}
      {sheets.isLoading && <div aria-label={`Loading sheets for ${doc.name}`} className="h-24 mt-3 bg-muted animate-pulse rounded" />}
      {sheets.isError && <div className="ai-error mt-2" role="alert">{sheets.error.message}<Button size="sm" variant="outline" onClick={() => sheets.refetch()}>Retry sheets</Button></div>}
      {sheets.data && <><div className="ai-row mt-2"><span className="ai-muted mr-auto">{pages.length} of {sheets.data.pages.length} prepared pages / sheets selected</span><Button size="sm" variant="ghost" disabled={!sheets.data.pages.length} onClick={() => onChange(sheets.data!.pages.slice(0, 500).map(s => s.page))}>Select all{ sheets.data.pages.length > 500 ? " (first 500)" : ""}</Button><Button size="sm" variant="ghost" onClick={() => onChange([])}>Clear pages</Button></div>{!sheets.data.pages.length && !["queued","processing"].includes(sheets.data.status||"") && <p className="ai-muted">No readable sheets found. Choose another document.</p>}<div className="ai-sheets">{sheets.data.pages.map(sheet => <label key={sheet.page} className="ai-sheet">
        {(doc.contentType.includes("pdf") || doc.contentType.startsWith("image/")) && <img loading="lazy" src={`${takeoffRoot(opportunityId)}/documents/${doc.id}/pages/${sheet.page}/thumbnail`} alt={`Preview of ${doc.name}, page ${sheet.page}`} onError={e => { e.currentTarget.style.display = "none"; }} />}
        <span className="ai-row"><input type="checkbox" checked={pages.includes(sheet.page)} disabled={!pages.includes(sheet.page) && pages.length >= 500} onChange={e => onChange(e.target.checked ? [...pages, sheet.page].sort((a, b) => a - b) : pages.filter(p => p !== sheet.page))} />Page {sheet.page}{sheet.sheetNumber ? ` · ${sheet.sheetNumber}` : ""}</span><strong>{sheet.title || `Sheet ${sheet.page}`}</strong>{sheet.scaleText.length > 0 && <span className="ai-muted">{sheet.scaleText.join(" · ")}</span>}
      </label>)}</div></>}
    </>}
  </div>;
}
