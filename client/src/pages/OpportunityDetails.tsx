import { useEffect, useState } from "react";
import { EstimateTab } from "@/components/estimating/EstimateTab";
import { discardEstimate } from "@/components/estimating/use-unsaved-estimate";
import { DocumentsTool } from "@/components/documents/DocumentsTool";
import { groupDocuments as groupSharedDocuments, useDocumentTools } from "@/components/documents/use-document-tools";
import { Link, useParams, useSearch } from "wouter";
import { format } from "date-fns";
import { ArrowLeft, Calendar, CheckCircle2, Loader2, Mail, MapPin, Phone, Plus, Star, Target, Trash2, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OpportunityFormDialog } from "@/components/OpportunityFormDialog";
import {
  useAddOpportunityContact, useArchiveOpportunity, useChangeOpportunityStatus, useCreateOpportunityCommunication,
  useCreateOpportunityTodo, useOpportunity,
  useOpportunityActivity, useOpportunityCommunications, useOpportunityContacts,
  useOpportunityStatusHistory, useOpportunityTodos, useRemoveOpportunityContact, useUpdateOpportunityContact,
} from "@/hooks/use-opportunities";
import { extractApiError, useAppUsers, useCompleteTodo, userDisplayName } from "@/hooks/use-todos";
import { useOpportunityScope } from "@/hooks/use-opportunity-scope";
import OpportunityScopeTab, { ReadinessBadge } from "@/components/opportunities/OpportunityScopeTab";
import { OpportunityMigrationHistory } from "@/components/opportunities/OpportunityMigrationHistory";
import { OpportunityHeaderActions } from "@/components/opportunities/OpportunityHeaderActions";
import { IncludedScopeItems } from "@/components/opportunities/IncludedScopeItems";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useProject } from "@/hooks/use-projects";
import { invalidateAwardQueries } from "@/hooks/use-project-bids";
import { awardDestination, awardStatusPayload, canChangeOpportunityStatus } from "@/lib/award-workflow";
import {
  getOpportunityStatusLabel, labelFor, OPPORTUNITY_CONTACT_ROLES, OPPORTUNITY_LOST_REASONS,
  OPPORTUNITY_NO_BID_REASONS, OPPORTUNITY_PROJECT_TYPES, OPPORTUNITY_SOURCES, OPPORTUNITY_STATUSES,
} from "@shared/opportunityStatus";
import type { Contact, OpportunityContactWithDetails } from "@shared/schema";

export default function OpportunityDetails() {
  const { id } = useParams<{ id: string }>();
  const search = useSearch();
  const opportunityId = Number(id);
  const backQuery = new URLSearchParams(search).get("from");
  const backHref = `/bidding${backQuery ? `?${backQuery}` : ""}`;
  const { toast } = useToast();
  const { canEstimate } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [estimateDirty, setEstimateDirty] = useState(false);
  const { data: opportunity, isLoading } = useOpportunity(Number.isFinite(opportunityId) ? opportunityId : undefined);
  const { data: contacts = [] } = useOpportunityContacts(opportunityId);
  const { data: todos = [] } = useOpportunityTodos(opportunityId);
  const { data: communications = [] } = useOpportunityCommunications(opportunityId);
  const { data: activity = [] } = useOpportunityActivity(opportunityId);
  const { data: history = [] } = useOpportunityStatusHistory(opportunityId);
  const { files: documentFiles } = useDocumentTools("opportunity", opportunityId);
  const documentCount = groupSharedDocuments(documentFiles.data ?? []).length;
  const scopeQuery = useOpportunityScope(opportunityId);
  const scope = scopeQuery.data;
  const archive = useArchiveOpportunity();
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [todoOpen, setTodoOpen] = useState(false);
  const [communicationOpen, setCommunicationOpen] = useState(false);

  if (isLoading) return <div className="py-20 text-center"><Loader2 className="w-7 h-7 animate-spin mx-auto" /></div>;
  if (!opportunity) return <div className="py-20 text-center"><p className="font-semibold">Opportunity not found</p><Link href={backHref}><Button className="mt-4" variant="outline">Back to Bidding</Button></Link></div>;
  const address = [opportunity.streetAddress, (opportunity as any).address2, opportunity.city, opportunity.state, opportunity.zip].filter(Boolean).join(", ");

  return (
    <div className="space-y-5 pt-14 md:pt-0 min-w-0">
      <Link href={backHref} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground min-h-11" data-testid="link-back-to-bidding"><ArrowLeft className="w-4 h-4 mr-1" />Back to Bidding</Link>
      <header className="flex flex-col lg:flex-row justify-between gap-4">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Target className="w-6 h-6 text-primary" /><span className="text-sm font-mono text-muted-foreground">{opportunity.opportunityNumber}</span><Badge>{getOpportunityStatusLabel(opportunity.status)}</Badge>{opportunity.isArchived && <Badge variant="outline">Archived</Badge>}{scope && !scopeQuery.isError && <ReadinessBadge readiness={scope.readiness} />}</div><h1 className="text-2xl sm:text-3xl font-bold mt-2 break-words">{opportunity.name}</h1><Link href={`/customers/${opportunity.customerId}`} className="text-sm text-primary hover:underline">{opportunity.customerName}</Link></div>
        <OpportunityHeaderActions
          opportunity={opportunity as any}
          onEdit={() => setEditOpen(true)}
          onChangeStatus={() => setStatusOpen(true)}
          archivePending={archive.isPending}
          onToggleArchive={() => archive.mutate({ id: opportunity.id, archived: !opportunity.isArchived }, { onSuccess: () => toast({ title: opportunity.isArchived ? "Opportunity restored" : "Opportunity archived" }) })}
        />
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Info label="Bid due" value={opportunity.bidDueDate ? `${opportunity.bidDueDate}${opportunity.bidDueTime ? ` · ${opportunity.bidDueTime}` : ""}` : "Not set"} icon={Calendar} />
        <Info label="Responsible" value={opportunity.responsibleUserName || "Unassigned"} icon={User} />
        {canEstimate && <Info label={`Expected value${opportunity.expectedValueEstimateRevision != null ? ` · from estimate Rev ${opportunity.expectedValueEstimateRevision}` : " · Manual"}`} value={opportunity.expectedValue == null ? "Not set" : `$${opportunity.expectedValue.toLocaleString()}`} icon={Target} />}
        {canEstimate && <Info label="Probability" value={opportunity.probability == null ? "Not set" : `${opportunity.probability}%`} icon={CheckCircle2} />}
      </div>

      {opportunity.status === "awarded" && <div className="rounded-lg border border-primary/25 bg-primary/[0.04] p-4 text-sm"><p className="font-medium">Contract snapshot · immutable</p><p className="text-muted-foreground mt-1">Bid planning remains editable; edits do not alter the awarded contract snapshot. Amendments require future project change orders, which are not available here.</p></div>}
      <Tabs value={activeTab} onValueChange={value => { if (!estimateDirty || value === activeTab || discardEstimate()) { setEstimateDirty(false); setActiveTab(value); } }} className="min-w-0">
        <TabsList className="w-full justify-start h-auto min-h-11 overflow-x-auto">
          {canEstimate && <TabsTrigger value="estimate" className="min-h-10 shrink-0">Estimate</TabsTrigger>}
          {["overview", "scope", "documents", "contacts", "todos", "communications", "activity", "migration"].map(tab => <TabsTrigger key={tab} value={tab} className="min-h-10 capitalize shrink-0">{tab === "migration" ? "Migration history" : tab}{tab === "scope" && scope && !scopeQuery.isError ? ` (${scope.items.length})` : tab === "documents" ? ` (${documentCount})` : tab === "contacts" ? ` (${contacts.length})` : tab === "todos" ? ` (${todos.length})` : tab === "communications" ? ` (${communications.length})` : ""}</TabsTrigger>)}
        </TabsList>
        {canEstimate && <TabsContent value="estimate"><EstimateTab key={opportunity.id} opportunityId={opportunity.id} onDirtyChange={setEstimateDirty} /></TabsContent>}
        <TabsContent value="scope"><OpportunityScopeTab opportunityId={opportunity.id} /></TabsContent>
        <TabsContent value="overview" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card><CardHeader><CardTitle className="text-base">Bid details</CardTitle></CardHeader><CardContent className="text-sm space-y-3"><Detail label="RFP received" value={opportunity.rfpReceivedDate} /><Detail label="Estimated start" value={opportunity.estimatedStartDate} /><Detail label="Source" value={labelFor(OPPORTUNITY_SOURCES, opportunity.source)} /><Detail label="Project type" value={labelFor(OPPORTUNITY_PROJECT_TYPES, opportunity.projectType)} />{address && <p className="flex gap-2"><MapPin className="w-4 h-4 shrink-0 text-muted-foreground" />{address}</p>}</CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Scope & notes</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">{scopeQuery.isLoading ? <p className="flex items-center gap-2 text-muted-foreground" data-testid="included-scope-loading"><Loader2 className="h-4 w-4 animate-spin" />Loading included scope items...</p> : scopeQuery.isError ? <div className="space-y-2" data-testid="included-scope-error"><p className="text-destructive">Unable to load included scope items.</p><Button size="sm" variant="outline" disabled={scopeQuery.isFetching} onClick={() => scopeQuery.refetch()}>{scopeQuery.isFetching && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Retry</Button></div> : <IncludedScopeItems items={scope?.items || []} />}<section><p className="text-xs text-muted-foreground mb-1">Scope summary</p><p className="whitespace-pre-wrap">{opportunity.scopeSummary || "No scope summary yet."}</p></section><section><p className="text-xs text-muted-foreground mb-1">Internal notes</p><p className="whitespace-pre-wrap">{opportunity.internalNotes || "No internal notes yet."}</p></section></CardContent></Card>
          {["lost", "no_bid", "awarded"].includes(opportunity.status) && <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-base">Outcome</CardTitle></CardHeader><CardContent className="text-sm">{opportunity.status === "lost" && <p>Lost reason: {labelFor(OPPORTUNITY_LOST_REASONS, opportunity.lostReason)}{opportunity.lostReasonNotes && ` — ${opportunity.lostReasonNotes}`}</p>}{opportunity.status === "no_bid" && <p>No Bid reason: {labelFor(OPPORTUNITY_NO_BID_REASONS, opportunity.noBidReason)}{opportunity.noBidReasonNotes && ` — ${opportunity.noBidReasonNotes}`}</p>}{opportunity.status === "awarded" && <p>Awarded {opportunity.awardDate || ""}</p>}</CardContent></Card>}
        </TabsContent>
        <TabsContent value="documents"><DocumentsTool entityType="opportunity" entityId={opportunity.id} /></TabsContent>
        <TabsContent value="contacts"><ContactsTab opportunityId={opportunity.id} customerId={opportunity.customerId} contacts={contacts} /></TabsContent>
        <TabsContent value="todos"><TodosTab opportunityId={opportunity.id} todos={todos} onAdd={() => setTodoOpen(true)} /></TabsContent>
        <TabsContent value="communications"><CommunicationsTab communications={communications} onAdd={() => setCommunicationOpen(true)} /></TabsContent>
        <TabsContent value="activity"><Card><CardContent className="p-4 divide-y">{activity.length === 0 && history.length === 0 ? <Empty text="No activity recorded yet." /> : <>{activity.map(entry => <div key={`a${entry.id}`} className="py-3 first:pt-0"><p className="text-sm">{entry.description}</p><p className="text-xs text-muted-foreground mt-1">{entry.actorName} · {entry.createdAt ? format(new Date(entry.createdAt), "MMM d, yyyy h:mm a") : ""}</p></div>)}{history.map(entry => <div key={`h${entry.id}`} className="py-3 first:pt-0"><p className="text-sm">{entry.previousStatus ? `${getOpportunityStatusLabel(entry.previousStatus)} → ` : ""}{getOpportunityStatusLabel(entry.newStatus)}</p><p className="text-xs text-muted-foreground mt-1">{entry.changedByName || "System"} · {entry.changedAt ? format(new Date(entry.changedAt), "MMM d, yyyy h:mm a") : ""}</p></div>)}</>}</CardContent></Card></TabsContent>
        <TabsContent value="migration"><OpportunityMigrationHistory opportunityId={opportunity.id} /></TabsContent>
      </Tabs>
      <OpportunityFormDialog open={editOpen} onOpenChange={setEditOpen} opportunity={opportunity} />
      <OpportunityStatusDialog open={statusOpen} onOpenChange={setStatusOpen} id={opportunity.id} current={opportunity.status} />
      <TodoDialog open={todoOpen} onOpenChange={setTodoOpen} opportunityId={opportunity.id} />
      <CommunicationDialog open={communicationOpen} onOpenChange={setCommunicationOpen} opportunityId={opportunity.id} contacts={contacts} />
    </div>
  );
}

function Info({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Calendar }) { return <Card><CardContent className="p-4 min-w-0"><p className="text-xs text-muted-foreground flex items-center gap-1"><Icon className="w-3.5 h-3.5" />{label}</p><p className="font-semibold mt-1 break-words">{value}</p></CardContent></Card>; }
function Detail({ label, value }: { label: string; value: string | null | undefined }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p>{value || "Not set"}</p></div>; }
function Empty({ text }: { text: string }) { return <div className="py-12 text-center text-sm text-muted-foreground">{text}</div>; }

export function OpportunityStatusDialog({ open, onOpenChange, id, current }: { open: boolean; onOpenChange: (v: boolean) => void; id: number; current: string }) {
  const { toast } = useToast(); const mutation = useChangeOpportunityStatus(); const [, setLocation] = useLocation();
  const { data: opportunity, isLoading: opportunityLoading, isError: opportunityError } = useOpportunity(id);
  const targetProjectId = (opportunity as any)?.targetProjectId as number | null | undefined;
  const { data: targetProject, isLoading: targetProjectLoading, isError: targetProjectError } = useProject(targetProjectId || 0);
  const [status, setStatus] = useState(current); const [reason, setReason] = useState(""); const [notes, setNotes] = useState(""); const [awardDate, setAwardDate] = useState(new Date().toISOString().slice(0, 10));
  useEffect(() => { if (open) { setStatus(current); setReason(""); setNotes(""); } }, [open, current]);
  const reasonList = status === "lost" ? OPPORTUNITY_LOST_REASONS : status === "no_bid" ? OPPORTUNITY_NO_BID_REASONS : [];
  const awardConfirmationReady = Boolean(opportunity) && !opportunityLoading && !opportunityError &&
    (!targetProjectId || (!!targetProject && !targetProjectLoading && !targetProjectError));
  const submit = () => {
    if (!canChangeOpportunityStatus(current, status)) { toast({ title: current === "awarded" ? "Awarded bids cannot be reversed" : "Reopen this bid first", description: current === "awarded" ? "The awarded contract and project association are immutable." : "Lost and No Bid opportunities must be reopened before award.", variant: "destructive" }); return; }
    if (reasonList.length && !reason) { toast({ title: "A reason is required", variant: "destructive" }); return; }
    mutation.mutate({ id, status: status as any, ...(status === "lost" ? { lostReason: reason as any, lostReasonNotes: notes || null } : {}), ...(status === "no_bid" ? { noBidReason: reason as any, noBidReasonNotes: notes || null } : {}), ...(status === "awarded" ? awardStatusPayload(awardDate, targetProjectId) : {}) } as any, { onSuccess: result => { toast({ title: status === "awarded" ? "Bid awarded" : "Status updated" }); onOpenChange(false); if (status === "awarded") { const projectId = (result as any).convertedProjectId || targetProjectId || undefined; invalidateAwardQueries(projectId, id); if (projectId) setLocation(`/projects/${projectId}?tab=bids`); } }, onError: e => toast({ title: "Couldn't change status", description: extractApiError(e, "Try again."), variant: "destructive" }) });
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{current === "awarded" ? "Award is final" : "Change Status"}</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>New status</Label><Select disabled={current === "awarded"} value={status} onValueChange={value => { setStatus(value); setReason(""); }}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent>{OPPORTUNITY_STATUSES.map(option => <SelectItem key={option.value} value={option.value} disabled={current === "awarded"}>{option.label}</SelectItem>)}</SelectContent></Select></div>{reasonList.length > 0 && <><div><Label>Reason *</Label><Select value={reason} onValueChange={setReason}><SelectTrigger className="min-h-11"><SelectValue placeholder="Select reason" /></SelectTrigger><SelectContent>{reasonList.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div><div><Label>Notes</Label><Textarea value={notes} onChange={event => setNotes(event.target.value)} /></div></>}{status === "awarded" && <div className="rounded-lg border border-primary/25 bg-primary/[0.04] p-4 space-y-2"><Label>Award date</Label><Input className="min-h-11" type="date" value={awardDate} onChange={event => setAwardDate(event.target.value)} /><p className="text-xs text-muted-foreground">Award date is not the project work/start date.</p><p className="text-sm">{awardDestination(targetProjectId, targetProject?.name)}</p><p className="text-sm text-muted-foreground">Bid planning remains editable; the contract snapshot does not. Amendments require future change orders, which are not implemented.</p>{opportunityError && <p className="text-sm text-destructive">Couldn’t load the opportunity.</p>}{targetProjectId && targetProjectLoading && <p className="text-xs">Loading selected project…</p>}{targetProjectId && (targetProjectError || (!targetProjectLoading && !targetProject)) && <p className="text-sm text-destructive">The selected project could not be loaded.</p>}</div>}</div><DialogFooter><Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>Cancel</Button><Button className="min-h-11" onClick={submit} disabled={mutation.isPending || status === current || !canChangeOpportunityStatus(current, status) || (status === "awarded" && !awardConfirmationReady)}>{status === "awarded" ? "Confirm award" : "Update status"}</Button></DialogFooter></DialogContent></Dialog>;
  /*
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{current === "awarded" ? "Award is final" : "Change Status"}</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>New status</Label><Select disabled={current === "awarded"} value={status} onValueChange={v => { setStatus(v); setReason(""); }}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent>{OPPORTUNITY_STATUSES.map(s => <SelectItem key={s.value} value={s.value} disabled={current === "awarded"}>{s.label}</SelectItem>)}</SelectContent></Select></div>{reasonList.length > 0 && <><div><Label>Reason *</Label><Select value={reason} onValueChange={setReason}><SelectTrigger className="min-h-11"><SelectValue placeholder="Select reason" /></SelectTrigger><SelectContent>{reasonList.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</Select></Select></div><div><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} /></div></>}{status === "awarded" && <><div><Label>Award date</Label><Input className="min-h-11" type="date" value={awardDate} onChange={e => setAwardDate(e.target.value)} /><p className="text-xs text-muted-foreground mt-1">This is the date the bid was awarded, not the project work/start date.</p></div><div className="rounded-lg border border-primary/25 bg-primary/[0.04] p-4 space-y-2"><p className="font-medium">{awardDestination(targetProjectId, targetProject?.name)}</p><p className="text-sm text-muted-foreground">This award captures the current bid scope and amount ({opportunity?.expectedValue == null ? "amount not recorded" : `$${Number(opportunity.expectedValue).toLocaleString()}`}) as an immutable contract snapshot. Bid planning can remain editable; amendments require future project change orders, which are not available here.</p>{opportunityError && <p className="text-sm text-destructive">The opportunity could not be loaded; retry before confirming.</p>}{targetProjectId && targetProjectLoading && <p className="text-xs text-muted-foreground">Loading the selected project before confirming…</p>}{targetProjectId && targetProjectError && <p className="text-sm text-destructive">The selected project could not be loaded; retry before awarding.</p>}{targetProjectId && !targetProjectLoading && !targetProjectError && !targetProject && <p className="text-sm text-destructive">The selected project could not be found; choose a valid project before awarding.</p>}{(current === "lost" || current === "no_bid") && <p className="text-sm text-destructive">Reopen this opportunity before awarding it.</p>}</div></>}</div><DialogFooter><Button className="min-h-11" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button className="min-h-11" onClick={submit} disabled={mutation.isPending || status === current || !canChangeOpportunityStatus(current, status) || (status === "awarded" && !awardConfirmationReady)}>{mutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}{status === "awarded" ? "Confirm award" : "Update status"}</Button></DialogFooter></DialogContent></Dialog>;
}

*/}
function ContactsTab({ opportunityId, customerId, contacts }: { opportunityId: number; customerId: number; contacts: OpportunityContactWithDetails[] }) {
  const { data: customerContacts = [] } = useQuery<Contact[]>({ queryKey: [`/api/customers/${customerId}/contacts`] });
  const add = useAddOpportunityContact(opportunityId); const update = useUpdateOpportunityContact(opportunityId); const remove = useRemoveOpportunityContact(opportunityId);
  const [contactId, setContactId] = useState(""); const [role, setRole] = useState(""); const [primary, setPrimary] = useState(false);
  const linked = new Set((contacts || []).map(c => c.contactId)); const available = customerContacts.filter(c => c.isActive && !linked.has(c.id));
  return <Card><CardContent className="p-4 space-y-4">{contacts.length === 0 && <Empty text="No contacts linked to this bid." />}{contacts.map(c => <div key={c.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3 last:border-0"><div className="min-w-0"><p className="font-medium flex items-center gap-2">{c.isPrimary && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}{c.firstName} {c.lastName}{c.role && <Badge variant="outline">{labelFor(OPPORTUNITY_CONTACT_ROLES, c.role)}</Badge>}</p><div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-3">{c.email && <a className="inline-flex min-h-11 items-center" href={`mailto:${c.email}`}><Mail className="inline w-3.5 h-3.5 mr-1" />{c.email}</a>}{(c.mobilePhone || c.officePhone) && <a className="inline-flex min-h-11 items-center" href={`tel:${c.mobilePhone || c.officePhone}`}><Phone className="inline w-3.5 h-3.5 mr-1" />{c.mobilePhone || c.officePhone}</a>}</div></div><div className="flex gap-2">{!c.isPrimary && <Button className="min-h-11" variant="outline" onClick={() => update.mutate({ id: c.id, isPrimary: true })}>Make primary</Button>}<Button className="min-h-11 min-w-11" variant="ghost" onClick={() => remove.mutate(c.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button></div></div>)}<div className="border-t pt-4 grid sm:grid-cols-[1fr_1fr_auto_auto] gap-2"><Select value={contactId} onValueChange={setContactId}><SelectTrigger className="min-h-11"><SelectValue placeholder="Choose contact" /></SelectTrigger><SelectContent>{available.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.firstName} {c.lastName}</SelectItem>)}</SelectContent></Select><Select value={role || "none"} onValueChange={v => setRole(v === "none" ? "" : v)}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No role</SelectItem>{OPPORTUNITY_CONTACT_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select><label className="min-h-11 flex items-center gap-2"><Checkbox checked={primary} onCheckedChange={v => setPrimary(v === true)} />Primary</label><Button className="min-h-11" disabled={!contactId || add.isPending} onClick={() => add.mutate({ contactId: Number(contactId), role: role as any || null, isPrimary: primary }, { onSuccess: () => { setContactId(""); setRole(""); setPrimary(false); } })}>Add</Button></div></CardContent></Card>;
}

function TodosTab({ opportunityId, todos, onAdd }: { opportunityId: number; todos: any[]; onAdd: () => void }) {
  const complete = useCompleteTodo();
  return <div className="space-y-3"><div className="flex justify-end"><Button className="min-h-11" onClick={onAdd}><Plus className="w-4 h-4 mr-2" />Add todo</Button></div>{todos.length === 0 ? <Card><Empty text="No todos for this opportunity." /></Card> : todos.map(todo => <Card key={todo.id}><CardContent className="p-4 flex justify-between gap-3"><div><p className={todo.status === "completed" ? "line-through text-muted-foreground" : "font-medium"}>{todo.title}</p><p className="text-xs text-muted-foreground mt-1">{todo.assignedToName || "Unassigned"}{todo.dueDate ? ` · Due ${todo.dueDate}` : ""} · {todo.priority}</p></div>{!["completed", "cancelled"].includes(todo.status) && <Button className="min-h-11" variant="outline" onClick={() => complete.mutate(todo.id)}><CheckCircle2 className="w-4 h-4 mr-2" />Complete</Button>}</CardContent></Card>)}</div>;
}

function TodoDialog({ open, onOpenChange, opportunityId }: { open: boolean; onOpenChange: (v: boolean) => void; opportunityId: number }) {
  const { data: users = [] } = useAppUsers(); const create = useCreateOpportunityTodo(opportunityId);
  const [title, setTitle] = useState(""); const [assignee, setAssignee] = useState(""); const [dueDate, setDueDate] = useState(""); const [priority, setPriority] = useState("normal"); const [description, setDescription] = useState("");
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Add Todo</DialogTitle></DialogHeader><div className="space-y-3"><div><Label>Title *</Label><Input className="min-h-11" value={title} onChange={e => setTitle(e.target.value)} /></div><div><Label>Assign to *</Label><Select value={assignee} onValueChange={setAssignee}><SelectTrigger className="min-h-11"><SelectValue placeholder="Choose user" /></SelectTrigger><SelectContent>{users.map(u => <SelectItem key={u.id} value={u.id}>{userDisplayName(u)}</SelectItem>)}</SelectContent></Select></div><div className="grid grid-cols-2 gap-3"><div><Label>Due date</Label><Input className="min-h-11" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div><div><Label>Priority</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent>{["low", "normal", "high", "urgent"].map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent></Select></div></div><div><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} /></div></div><DialogFooter><Button className="min-h-11" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button className="min-h-11" disabled={!title.trim() || !assignee || create.isPending} onClick={() => create.mutate({ title: title.trim(), assignedToUserId: assignee, dueDate: dueDate || null, priority, description: description || null }, { onSuccess: () => { onOpenChange(false); setTitle(""); } })}>Add todo</Button></DialogFooter></DialogContent></Dialog>;
}

function CommunicationsTab({ communications, onAdd }: { communications: any[]; onAdd: () => void }) {
  return <div className="space-y-3"><div className="flex justify-end"><Button className="min-h-11" onClick={onAdd}><Plus className="w-4 h-4 mr-2" />Log communication</Button></div>{communications.length === 0 ? <Card><Empty text="No communications logged for this opportunity." /></Card> : communications.map(comm => <Card key={comm.id}><CardContent className="p-4"><div className="flex flex-wrap gap-2 items-center"><Badge variant="secondary" className="capitalize">{comm.type}</Badge><p className="font-medium">{comm.subject || "Communication"}</p><p className="text-xs text-muted-foreground sm:ml-auto">{comm.contactDate ? format(new Date(comm.contactDate), "MMM d, yyyy h:mm a") : ""}</p></div><p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{comm.notes}</p></CardContent></Card>)}</div>;
}

function CommunicationDialog({ open, onOpenChange, opportunityId, contacts }: { open: boolean; onOpenChange: (v: boolean) => void; opportunityId: number; contacts: any[] }) {
  const create = useCreateOpportunityCommunication(opportunityId); const [type, setType] = useState("phone"); const [subject, setSubject] = useState(""); const [notes, setNotes] = useState(""); const [contactId, setContactId] = useState("none"); const [followUpDate, setFollowUpDate] = useState("");
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Log Communication</DialogTitle></DialogHeader><div className="space-y-3"><div><Label>Type</Label><Select value={type} onValueChange={setType}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent>{["phone", "email", "meeting", "site_visit", "other"].map(v => <SelectItem key={v} value={v}>{v.replace("_", " ")}</SelectItem>)}</SelectContent></Select></div><div><Label>Contact</Label><Select value={contactId} onValueChange={setContactId}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No contact</SelectItem>{contacts.map(c => <SelectItem key={c.contactId} value={String(c.contactId)}>{c.firstName} {c.lastName}</SelectItem>)}</SelectContent></Select></div><div><Label>Subject</Label><Input className="min-h-11" value={subject} onChange={e => setSubject(e.target.value)} /></div><div><Label>Notes *</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} /></div><div><Label>Follow-up date</Label><Input className="min-h-11" type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} /></div></div><DialogFooter><Button className="min-h-11" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button className="min-h-11" disabled={!notes.trim() || create.isPending} onClick={() => create.mutate({ type, subject: subject || null, notes: notes.trim(), contactId: contactId === "none" ? null : Number(contactId), contactDate: new Date().toISOString(), followUpDate: followUpDate || null }, { onSuccess: () => { onOpenChange(false); setNotes(""); setSubject(""); } })}>Log communication</Button></DialogFooter></DialogContent></Dialog>;
}
