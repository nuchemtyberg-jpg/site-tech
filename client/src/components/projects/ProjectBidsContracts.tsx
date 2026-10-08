import { useMemo, useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { AlertTriangle, ArrowUpRight, FilePlus2, Loader2, LockKeyhole, Plus, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OpportunityFormDialog } from "@/components/OpportunityFormDialog";
import { useProjectBids, type ContractRecord, type ProjectBid } from "@/hooks/use-project-bids";

const money = (amount: number | null | undefined) => amount == null ? "Not recorded" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
function SnapshotDialog({ bid, onClose }: { bid: any | null; onClose: () => void }) {
  const snapshot = bid?.contract?.snapshot;
  const readableEntries = snapshot ? Object.entries(snapshot).filter(([key]) => key !== "scopeItems") : [];
  const labelForField = (key: string) => ({
    opportunityNumber: "Bid number", name: "Bid name", customerId: "Customer ID",
    responsibleUserId: "Responsible user ID", targetProjectId: "Target project ID",
    convertedProjectId: "Awarded project ID", expectedValue: "Expected value",
    probability: "Probability", address2: "Address line 2", rfpReceivedDate: "RFP received",
    estimatedStartDate: "Estimated start", bidDueDate: "Bid due", bidDueTime: "Bid due time",
    scopeSummary: "Scope summary", internalNotes: "Internal notes",
  }[key] || key.replace(/([A-Z])/g, " $1").replace(/^./, value => value.toUpperCase()));
  const displayValue = (key: string, value: unknown) => {
    if (value == null || value === "") return "Not recorded";
    if (key === "expectedValue") return money(Number(value));
    if (key === "probability") return `${value}%`;
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  };
  return <Dialog open={!!bid} onOpenChange={open => !open && onClose()}><DialogContent className="max-w-2xl max-h-[88dvh] overflow-y-auto">
    <DialogHeader><DialogTitle>Original awarded scope</DialogTitle><DialogDescription>Read-only award snapshot for {bid?.opportunityNumber}. This record cannot be edited.</DialogDescription></DialogHeader>
    {snapshot && <div className="grid sm:grid-cols-2 gap-x-6 gap-y-4">{readableEntries.map(([key, value]) => <div key={key} className={["scopeSummary", "internalNotes"].includes(key) ? "sm:col-span-2" : ""}><p className="text-xs uppercase tracking-wide text-muted-foreground">{labelForField(key)}</p><p className="text-sm whitespace-pre-wrap mt-1">{displayValue(key, value)}</p></div>)}
      {snapshot.scopeItems?.length > 0 && <div className="sm:col-span-2"><p className="text-xs uppercase text-muted-foreground mb-2">Scope checklist at award</p>{snapshot.scopeItems.map((item: any) => <div key={item.id} className="border-b py-2 text-sm"><p>{item.name} · {item.status.replaceAll("_", " ")}</p>{item.notes && <p className="text-muted-foreground whitespace-pre-wrap">{item.notes}</p>}</div>)}</div>}
    </div>}
  </DialogContent></Dialog>;
}
export function ProjectBidsContracts({ projectId, project }: { projectId: number; project: any }) {
  const query = useProjectBids(projectId);
  const [formOpen, setFormOpen] = useState(false);
  const [snapshotBid, setSnapshotBid] = useState<any | null>(null);
  const data = query.data;
  const awarded = useMemo(() => (data?.bids ?? []).filter((b): b is ProjectBid & { contract: ContractRecord } => !!b.contract), [data?.bids]);
  const brokenAwards = useMemo(() => (data?.bids ?? []).filter(b => !b.contract && b.status === "awarded"), [data?.bids]);
  const pending = useMemo(() => (data?.bids ?? []).filter((b): b is ProjectBid & { contract: null } => !b.contract && b.status !== "awarded" && !["lost", "no_bid"].includes(b.status)), [data?.bids]);
  const closed = useMemo(() => (data?.bids ?? []).filter(b => !b.contract && ["lost", "no_bid"].includes(b.status)), [data?.bids]);
  if (query.isLoading) return <div className="space-y-3" aria-label="Loading bid contracts">{[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl bg-muted/60 animate-pulse" />)}</div>;
  if (query.isError) return <Card><CardContent className="py-12 text-center"><ReceiptText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p>Couldn’t load bids and contracts.</p><Button className="mt-4" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>Retry</Button></CardContent></Card>;
  return <div className="space-y-6" data-testid="project-bids-contracts">
    <div className="grid sm:grid-cols-2 gap-3">
      <Card className="border-primary/20 bg-primary/[0.035]"><CardContent className="p-5"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Awarded contracts</p><p className="mt-2 text-2xl font-semibold tabular-nums">{money(data?.awardedTotal)}</p><p className="text-xs text-muted-foreground mt-1">{awarded.length} immutable contract{awarded.length === 1 ? "" : "s"}</p></CardContent></Card>
      <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Pending bids</p><p className="mt-2 text-2xl font-semibold tabular-nums">{money(data?.pendingTotal)}</p><p className="text-xs text-muted-foreground mt-1">{pending.length} awaiting outcome</p></CardContent></Card>
    </div>
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b pb-3">
      <div><p className="text-xs uppercase tracking-[0.16em] text-primary">Commercial record</p><h2 className="text-xl font-semibold mt-1">Bids & contracts</h2><p className="text-sm text-muted-foreground mt-1">Each award is retained as its own contract. Scope and award amount stay fixed.</p></div>
      <Button className="min-h-11" onClick={() => setFormOpen(true)}><Plus className="h-4 w-4 mr-2" />Add bid to project</Button>
    </div>
    {!data?.bids.length ? <Card className="border-dashed"><CardContent className="py-14 text-center"><FilePlus2 className="h-9 w-9 mx-auto text-muted-foreground mb-3" /><p className="font-medium">No bids linked yet</p><p className="text-sm text-muted-foreground mt-1">Add the first bid, or award one from Bidding to establish its contract.</p><Button className="mt-4" variant="outline" onClick={() => setFormOpen(true)}>Create first bid</Button></CardContent></Card> : <>
      {awarded.length > 0 && <section className="space-y-3"><div className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-primary" /><h3 className="font-semibold">Awarded contracts <span className="text-muted-foreground font-normal">({awarded.length})</span></h3></div>
        {awarded.map(bid => <Card key={bid.id} className="overflow-hidden"><div className="h-1 bg-primary/75" /><CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{bid.opportunityNumber}</span><Badge variant="secondary">Awarded</Badge><span className="text-xs text-muted-foreground">Contract #{bid.contract.id}</span></div><h4 className="text-lg font-semibold mt-2">{bid.name}</h4><p className="text-sm text-muted-foreground mt-1">{bid.customerName || project?.customerName || "Customer"}</p></div><div className="sm:text-right shrink-0"><p className="text-xs text-muted-foreground">Contract value</p><p className="text-xl font-semibold tabular-nums">{money(bid.contract.amount)}</p><p className="text-xs text-muted-foreground mt-1">Awarded {bid.contract.awardDate ? format(new Date(bid.contract.awardDate), "MMM d, yyyy") : "date not recorded"}</p></div></div>
          <p className="text-sm mt-4 whitespace-pre-wrap line-clamp-3">{bid.contract.snapshot?.scopeSummary || "No scope summary captured."}</p>
          <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t"><Button size="sm" variant="outline" onClick={() => setSnapshotBid(bid)}><ReceiptText className="h-4 w-4 mr-2" />View award snapshot</Button><Link href={`/bidding/${bid.id}?from=${encodeURIComponent(`project=${projectId}&tab=bids`)}`} className="inline-flex items-center min-h-9 px-3 text-sm text-primary hover:underline">Open in Bidding <ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Link></div>
          <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />Bid planning remains editable, but this contract snapshot does not change. Amendments require future project change orders; that workflow is not available here.</p>
        </CardContent></Card>)}
      </section>}
      {brokenAwards.length > 0 && <section className="space-y-3" aria-label="Award association conflicts"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-700" /><h3 className="font-semibold">Award association needs repair <span className="text-muted-foreground font-normal">({brokenAwards.length})</span></h3></div>
        {brokenAwards.map(bid => <Card key={bid.id} className="border-amber-700/25"><CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div className="min-w-0"><div className="flex gap-2 items-center"><span className="font-mono text-xs text-muted-foreground">{bid.opportunityNumber}</span><Badge variant="destructive">Awarded · no contract</Badge></div><p className="font-medium mt-1">{bid.name}</p><p className="text-xs text-muted-foreground mt-1">This bid is awarded but has no linked contract record, so it is excluded from pending totals.</p></div><Link href={`/bidding/${bid.id}?from=${encodeURIComponent(`project=${projectId}&tab=bids`)}`} className="inline-flex items-center min-h-11 text-sm text-primary hover:underline shrink-0">Review bid <ArrowUpRight className="h-4 w-4 ml-1" /></Link></CardContent></Card>)}
      </section>}
      {pending.length > 0 && <section className="space-y-3"><h3 className="font-semibold">Pending bids <span className="text-muted-foreground font-normal">({pending.length})</span></h3>{pending.map(bid => <Card key={bid.id}><CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div className="min-w-0"><div className="flex gap-2 items-center"><span className="font-mono text-xs text-muted-foreground">{bid.opportunityNumber}</span><Badge variant="outline" className="capitalize">{String(bid.status).replaceAll("_", " ")}</Badge></div><p className="font-medium mt-1">{bid.name}</p><p className="text-xs text-muted-foreground mt-1">{bid.bidDueDate ? `Due ${bid.bidDueDate}` : "No due date"} · {money(bid.expectedValue)}</p><p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap line-clamp-2">{bid.scopeSummary || "No scope summary recorded."}</p></div><Link href={`/bidding/${bid.id}?from=${encodeURIComponent(`project=${projectId}&tab=bids`)}`} className="inline-flex items-center min-h-11 text-sm text-primary hover:underline shrink-0">Open in Bidding <ArrowUpRight className="h-4 w-4 ml-1" /></Link></CardContent></Card>)}</section>}
      {closed.length > 0 && <section className="space-y-3"><h3 className="font-semibold">Closed without award <span className="text-muted-foreground font-normal">({closed.length})</span></h3>{closed.map(bid => <Card key={bid.id}><CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div className="min-w-0"><div className="flex gap-2 items-center"><span className="font-mono text-xs text-muted-foreground">{bid.opportunityNumber}</span><Badge variant="outline" className="capitalize">{String(bid.status).replaceAll("_", " ")}</Badge></div><p className="font-medium mt-1">{bid.name}</p></div><Link href={`/bidding/${bid.id}?from=${encodeURIComponent(`project=${projectId}&tab=bids`)}`} className="inline-flex items-center min-h-11 text-sm text-primary hover:underline shrink-0">Open in Bidding <ArrowUpRight className="h-4 w-4 ml-1" /></Link></CardContent></Card>)}</section>}
    </>}
    <OpportunityFormDialog open={formOpen} onOpenChange={setFormOpen} defaultProjectId={projectId} defaultCustomerId={project?.customerId} defaultProjectName={project?.name} defaultAddress={{ streetAddress: project?.streetAddress, address2: project?.address2, city: project?.city, state: project?.state, zip: project?.zip }} />
    <SnapshotDialog bid={snapshotBid} onClose={() => setSnapshotBid(null)} />
  </div>;
}
