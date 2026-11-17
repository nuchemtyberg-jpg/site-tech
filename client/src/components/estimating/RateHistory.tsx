import { useState } from "react";
import { useRateHistory, useRateHistoryDetail } from "@/hooks/use-rate-import";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RatesEditor } from "./RatesEditor";
import "./rate-management.css";

export function RateHistory() {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<number>();
  const history = useRateHistory(expanded);
  const detail = useRateHistoryDetail(selected);
  return <section className="estimate-workspace estimate-panel p-3 space-y-3">
    <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold">Company rate history</h2><p className="text-xs text-muted-foreground">Read-only saved snapshots · latest 100 changes</p></div><Button size="sm" variant="outline" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "Hide history" : "View history"}</Button></div>
    {expanded && <>{history.isLoading && <div aria-label="Loading rate history" className="h-20 rounded bg-muted animate-pulse" />}{history.isError && <div role="alert"><p>{history.error.message}</p><Button variant="outline" size="sm" onClick={() => void history.refetch()}>Retry history</Button></div>}{history.data?.length === 0 && <div className="border rounded p-4"><p className="font-medium">No saved history yet</p><p className="text-xs text-muted-foreground mt-1">Future company rate saves and imports will appear here.</p></div>}{history.data?.map(entry => <div key={entry.id} className="rate-history-row"><div><p className="font-medium">Version {entry.version} · {entry.source}</p><p className="text-xs text-muted-foreground">{entry.author || entry.savedBy} · <time dateTime={entry.savedAt}>{new Date(entry.savedAt).toLocaleString()}</time></p></div><Button size="sm" variant="outline" onClick={() => setSelected(entry.id)}>View snapshot<span className="sr-only"> version {entry.version}</span></Button></div>)}</>}
    <Dialog open={selected !== undefined} onOpenChange={open => { if (!open) setSelected(undefined); }}><DialogContent className="rate-dialog sm:max-w-[960px]"><DialogHeader><DialogTitle>Rate snapshot{detail.data ? ` · version ${detail.data.version}` : ""}</DialogTitle><DialogDescription>{detail.data ? `${detail.data.author || detail.data.savedBy} · ${new Date(detail.data.savedAt).toLocaleString()} · ${detail.data.source}. Read-only; current company rates are unchanged.` : "A read-only saved copy of company rates."}</DialogDescription></DialogHeader>{detail.isLoading && <div aria-label="Loading rate snapshot" className="h-40 rounded bg-muted animate-pulse" />}{detail.isError && <div role="alert"><p>{detail.error.message}</p><Button variant="outline" onClick={() => void detail.refetch()}>Retry snapshot</Button></div>}{detail.data && <RatesEditor key={selected} rates={detail.data.rates} readOnly onChange={() => {}} />}</DialogContent></Dialog>
  </section>;
}
