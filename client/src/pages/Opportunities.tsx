import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Plus, Loader2, Target, Archive, ArchiveRestore, Pencil, Trash2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { extractApiError, useAppUsers, userDisplayName } from "@/hooks/use-todos";
import {
  useOpportunities, useOpportunity, useCreateOpportunity, useUpdateOpportunity,
  useChangeOpportunityStatus, useArchiveOpportunity, useOpportunityStatusHistory,
  useOpportunityContacts, useAddOpportunityContact, useUpdateOpportunityContact,
  useRemoveOpportunityContact,
} from "@/hooks/use-opportunities";
import {
  OPPORTUNITY_STATUSES, getOpportunityStatusLabel, OPPORTUNITY_SOURCES,
  OPPORTUNITY_PROJECT_TYPES, OPPORTUNITY_CONTACT_ROLES, OPPORTUNITY_LOST_REASONS,
  OPPORTUNITY_NO_BID_REASONS, labelFor,
} from "@shared/opportunityStatus";
import type { Customer, Contact, OpportunityWithDetails } from "@shared/schema";

// Simple functional test UI for the Phase 4 Opportunity backend.
// Deliberately plain — the polished bidding pipeline dashboard is Phase 5.

type FormState = {
  name: string; customerId: string; status: string; responsibleUserId: string;
  streetAddress: string; address2: string; city: string; state: string; zip: string;
  rfpReceivedDate: string; bidDueDate: string; bidDueTime: string; estimatedStartDate: string;
  source: string; projectType: string; scopeSummary: string; internalNotes: string;
  expectedValue: string; probability: string;
};

const EMPTY_FORM: FormState = {
  name: "", customerId: "", status: "new", responsibleUserId: "",
  streetAddress: "", address2: "", city: "", state: "", zip: "",
  rfpReceivedDate: "", bidDueDate: "", bidDueTime: "", estimatedStartDate: "",
  source: "", projectType: "", scopeSummary: "", internalNotes: "",
  expectedValue: "", probability: "",
};

export default function Opportunities() {
  const { toast } = useToast();
  const [, params] = useRoute("/opportunities/:id"); // deep link (e.g. from workflow emails)
  const routeId = params?.id ? Number(params.id) : undefined;
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | undefined>(routeId);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OpportunityWithDetails | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data: opportunities = [], isLoading } = useOpportunities({
    status: statusFilter === "all" ? undefined : statusFilter,
    includeArchived,
    search: search || undefined,
  });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: users = [] } = useAppUsers();

  const createOpp = useCreateOpportunity();
  const updateOpp = useUpdateOpportunity();

  const set = (k: keyof FormState) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };
  const openEdit = (o: OpportunityWithDetails) => {
    setEditing(o);
    setForm({
      name: o.name, customerId: String(o.customerId), status: o.status,
      responsibleUserId: o.responsibleUserId ?? "",
      streetAddress: o.streetAddress ?? "", address2: o.address2 ?? "",
      city: o.city ?? "", state: o.state ?? "", zip: o.zip ?? "",
      rfpReceivedDate: o.rfpReceivedDate ?? "", bidDueDate: o.bidDueDate ?? "",
      bidDueTime: o.bidDueTime ?? "", estimatedStartDate: o.estimatedStartDate ?? "",
      source: o.source ?? "", projectType: o.projectType ?? "",
      scopeSummary: o.scopeSummary ?? "", internalNotes: o.internalNotes ?? "",
      expectedValue: o.expectedValue != null ? String(o.expectedValue) : "",
      probability: o.probability != null ? String(o.probability) : "",
    });
    setFormOpen(true);
  };

  const submitForm = (confirmRemoveContacts = false) => {
    if (!form.name.trim() || !form.customerId) {
      toast({ title: "Name and customer are required", variant: "destructive" });
      return;
    }
    const optional = {
      responsibleUserId: form.responsibleUserId || null,
      streetAddress: form.streetAddress || null, address2: form.address2 || null,
      city: form.city || null, state: form.state || null, zip: form.zip || null,
      rfpReceivedDate: form.rfpReceivedDate || null, bidDueDate: form.bidDueDate || null,
      bidDueTime: form.bidDueTime || null, estimatedStartDate: form.estimatedStartDate || null,
      source: form.source || null, projectType: form.projectType || null,
      scopeSummary: form.scopeSummary || null, internalNotes: form.internalNotes || null,
      expectedValue: form.expectedValue ? Number(form.expectedValue) : null,
      probability: form.probability ? Number(form.probability) : null,
    };
    if (editing) {
      updateOpp.mutate(
        { id: editing.id, name: form.name.trim(), customerId: Number(form.customerId), ...optional, confirmRemoveContacts },
        {
          onSuccess: () => { toast({ title: "Opportunity updated" }); setFormOpen(false); },
          onError: (err) => {
            const msg = extractApiError(err, "Please try again.");
            if (err instanceof Error && err.message.startsWith("409")) {
              if (window.confirm(msg)) submitForm(true);
            } else {
              toast({ title: "Couldn't update opportunity", description: msg, variant: "destructive" });
            }
          },
        },
      );
    } else {
      createOpp.mutate(
        { name: form.name.trim(), customerId: Number(form.customerId), status: form.status as any, ...optional },
        {
          onSuccess: (o) => { toast({ title: `Created ${o.opportunityNumber}` }); setFormOpen(false); setSelectedId(o.id); },
          onError: (err) => toast({ title: "Couldn't create opportunity", description: extractApiError(err, "Please try again."), variant: "destructive" }),
        },
      );
    }
  };

  const pending = createOpp.isPending || updateOpp.isPending;

  return (
    <div className="space-y-5 pt-14 md:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-opportunities-title">
            <Target className="w-6 h-6 text-primary" />Opportunities
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Potential jobs being evaluated, bid, or negotiated (RFPs).</p>
        </div>
        <Button onClick={openCreate} className="min-h-[44px]" data-testid="button-new-opportunity">
          <Plus className="w-4 h-4 mr-2" />New Opportunity
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44" data-testid="select-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {OPPORTUNITY_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Search name or number…" value={search} onChange={e => setSearch(e.target.value)} className="w-56" data-testid="input-opportunity-search" />
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox checked={includeArchived} onCheckedChange={(c) => setIncludeArchived(c === true)} data-testid="checkbox-include-archived" />
          Show archived
        </label>
      </div>

      {isLoading ? (
        <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
      ) : opportunities.length === 0 ? (
        <div className="text-center py-14 border border-dashed border-border rounded-lg">
          <Target className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium">No opportunities yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {opportunities.map(o => (
            <Card key={o.id} className={`cursor-pointer hover:border-primary/50 ${o.isArchived ? "opacity-60" : ""}`} onClick={() => setSelectedId(o.id)} data-testid={`card-opportunity-${o.id}`}>
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm">
                    <span className="text-muted-foreground font-mono mr-2">{o.opportunityNumber}</span>{o.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {o.customerName}
                    {o.responsibleUserName ? ` · ${o.responsibleUserName}` : ""}
                    {o.bidDueDate ? ` · Bid due ${o.bidDueDate}${o.bidDueTime ? ` ${o.bidDueTime}` : ""}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {o.isArchived && <Badge variant="outline" className="text-[10px]">Archived</Badge>}
                  <Badge variant="secondary" data-testid={`badge-status-${o.id}`}>{getOpportunityStatusLabel(o.status)}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.opportunityNumber}` : "New Opportunity"}</DialogTitle>
            <DialogDescription>Only name, customer, and status are required. Everything else can be filled in later.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => set("name")(e.target.value)} data-testid="input-opp-name" />
            </div>
            <div>
              <Label>Customer *</Label>
              <Select value={form.customerId} onValueChange={set("customerId")}>
                <SelectTrigger data-testid="select-opp-customer"><SelectValue placeholder="Pick a customer" /></SelectTrigger>
                <SelectContent>{customers.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {!editing && (
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={set("status")}>
                  <SelectTrigger data-testid="select-opp-status"><SelectValue /></SelectTrigger>
                  <SelectContent>{OPPORTUNITY_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Responsible user</Label>
              <Select value={form.responsibleUserId || "none"} onValueChange={v => set("responsibleUserId")(v === "none" ? "" : v)}>
                <SelectTrigger data-testid="select-opp-responsible"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {users.map(u => <SelectItem key={u.id} value={u.id}>{userDisplayName(u)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Source</Label>
              <Select value={form.source || "none"} onValueChange={v => set("source")(v === "none" ? "" : v)}>
                <SelectTrigger data-testid="select-opp-source"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {OPPORTUNITY_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Project type</Label>
              <Select value={form.projectType || "none"} onValueChange={v => set("projectType")(v === "none" ? "" : v)}>
                <SelectTrigger data-testid="select-opp-project-type"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {OPPORTUNITY_PROJECT_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="col-span-2"><Label>Street address</Label><Input value={form.streetAddress} onChange={e => set("streetAddress")(e.target.value)} /></div>
              <div className="col-span-2"><Label>Address 2</Label><Input value={form.address2} onChange={e => set("address2")(e.target.value)} /></div>
              <div><Label>City</Label><Input value={form.city} onChange={e => set("city")(e.target.value)} /></div>
              <div><Label>State</Label><Input value={form.state} onChange={e => set("state")(e.target.value)} /></div>
              <div><Label>Zip</Label><Input value={form.zip} onChange={e => set("zip")(e.target.value)} /></div>
            </div>
            <div><Label>RFP received</Label><Input type="date" value={form.rfpReceivedDate} onChange={e => set("rfpReceivedDate")(e.target.value)} data-testid="input-opp-rfp-received" /></div>
            <div className="flex gap-2">
              <div className="flex-1"><Label>Bid due date</Label><Input type="date" value={form.bidDueDate} onChange={e => set("bidDueDate")(e.target.value)} data-testid="input-opp-bid-due" /></div>
              <div className="w-28"><Label>Time</Label><Input type="time" value={form.bidDueTime} onChange={e => set("bidDueTime")(e.target.value)} /></div>
            </div>
            <div><Label>Estimated start</Label><Input type="date" value={form.estimatedStartDate} onChange={e => set("estimatedStartDate")(e.target.value)} /></div>
            <div className="flex gap-2">
              <div className="flex-1"><Label>Expected value ($)</Label><Input type="number" min="0" value={form.expectedValue} onChange={e => set("expectedValue")(e.target.value)} data-testid="input-opp-expected-value" /></div>
              <div className="w-28"><Label>Probability %</Label><Input type="number" min="0" max="100" value={form.probability} onChange={e => set("probability")(e.target.value)} data-testid="input-opp-probability" /></div>
            </div>
            <div className="sm:col-span-2"><Label>Scope summary</Label><Textarea rows={2} value={form.scopeSummary} onChange={e => set("scopeSummary")(e.target.value)} /></div>
            <div className="sm:col-span-2"><Label>Internal notes</Label><Textarea rows={2} value={form.internalNotes} onChange={e => set("internalNotes")(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={() => submitForm()} disabled={pending} data-testid="button-opp-save">
              {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editing ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail dialog */}
      <OpportunityDetail id={selectedId} onClose={() => setSelectedId(undefined)} onEdit={openEdit} />
    </div>
  );
}

function OpportunityDetail({ id, onClose, onEdit }: { id: number | undefined; onClose: () => void; onEdit: (o: OpportunityWithDetails) => void }) {
  const { toast } = useToast();
  const { data: opp } = useOpportunity(id);
  const { data: history = [] } = useOpportunityStatusHistory(id);
  const { data: oppContacts = [] } = useOpportunityContacts(id);
  const { data: customerContacts = [] } = useQuery<Contact[]>({
    queryKey: [`/api/customers/${opp?.customerId}/contacts`],
    enabled: !!opp,
  });

  const changeStatus = useChangeOpportunityStatus();
  const archive = useArchiveOpportunity();
  const addContact = useAddOpportunityContact(id ?? 0);
  const updateContact = useUpdateOpportunityContact(id ?? 0);
  const removeContact = useRemoveOpportunityContact(id ?? 0);

  const [newStatus, setNewStatus] = useState("");
  const [reason, setReason] = useState("");
  const [reasonNotes, setReasonNotes] = useState("");
  const [contactId, setContactId] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [contactPrimary, setContactPrimary] = useState(false);

  if (!id) return null;

  const needsLostReason = newStatus === "lost";
  const needsNoBidReason = newStatus === "no_bid";

  const applyStatus = () => {
    if (!newStatus || !opp) return;
    if (needsLostReason && !reason) { toast({ title: "Pick a lost reason", variant: "destructive" }); return; }
    if (needsNoBidReason && !reason) { toast({ title: "Pick a no-bid reason", variant: "destructive" }); return; }
    changeStatus.mutate(
      {
        id: opp.id, status: newStatus as any,
        ...(needsLostReason ? { lostReason: reason as any, lostReasonNotes: reasonNotes || undefined } : {}),
        ...(needsNoBidReason ? { noBidReason: reason as any, noBidReasonNotes: reasonNotes || undefined } : {}),
      },
      {
        onSuccess: () => { toast({ title: "Status updated" }); setNewStatus(""); setReason(""); setReasonNotes(""); },
        onError: (err) => toast({ title: "Couldn't change status", description: extractApiError(err, "Please try again."), variant: "destructive" }),
      },
    );
  };

  const linkedContactIds = new Set(oppContacts.map(c => c.contactId));
  const availableContacts = customerContacts.filter(c => c.isActive && !linkedContactIds.has(c.id));

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {!opp ? (
          <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap" data-testid="text-opp-detail-title">
                <span className="font-mono text-muted-foreground">{opp.opportunityNumber}</span>{opp.name}
                <Badge variant="secondary">{getOpportunityStatusLabel(opp.status)}</Badge>
                {opp.isArchived && <Badge variant="outline">Archived</Badge>}
              </DialogTitle>
              <DialogDescription>{opp.customerName}{opp.responsibleUserName ? ` · Responsible: ${opp.responsibleUserName}` : ""}</DialogDescription>
            </DialogHeader>

            <div className="text-sm space-y-1 text-muted-foreground">
              {opp.bidDueDate && <p>Bid due: {opp.bidDueDate}{opp.bidDueTime ? ` at ${opp.bidDueTime}` : ""}</p>}
              {opp.rfpReceivedDate && <p>RFP received: {opp.rfpReceivedDate}</p>}
              {opp.estimatedStartDate && <p>Estimated start: {opp.estimatedStartDate}</p>}
              {opp.source && <p>Source: {labelFor(OPPORTUNITY_SOURCES, opp.source)}</p>}
              {opp.projectType && <p>Type: {labelFor(OPPORTUNITY_PROJECT_TYPES, opp.projectType)}</p>}
              {opp.expectedValue != null && <p>Expected value: ${opp.expectedValue.toLocaleString()}{opp.probability != null ? ` · ${opp.probability}% probability` : ""}</p>}
              {opp.scopeSummary && <p>Scope: {opp.scopeSummary}</p>}
              {opp.internalNotes && <p>Notes: {opp.internalNotes}</p>}
              {opp.status === "lost" && opp.lostReason && <p className="text-destructive">Lost — {labelFor(OPPORTUNITY_LOST_REASONS, opp.lostReason)}{opp.lostReasonNotes ? `: ${opp.lostReasonNotes}` : ""}</p>}
              {opp.status === "no_bid" && opp.noBidReason && <p className="text-destructive">No Bid — {labelFor(OPPORTUNITY_NO_BID_REASONS, opp.noBidReason)}{opp.noBidReasonNotes ? `: ${opp.noBidReasonNotes}` : ""}</p>}
              {opp.status === "awarded" && opp.awardDate && <p className="text-green-600 dark:text-green-400">Awarded on {opp.awardDate}</p>}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => { onClose(); onEdit(opp); }} data-testid="button-opp-edit">
                <Pencil className="w-3.5 h-3.5 mr-1.5" />Edit
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={() => archive.mutate({ id: opp.id, archived: !opp.isArchived }, {
                  onSuccess: () => toast({ title: opp.isArchived ? "Unarchived" : "Archived" }),
                  onError: (err) => toast({ title: "Couldn't update", description: extractApiError(err, "Try again."), variant: "destructive" }),
                })}
                data-testid="button-opp-archive"
              >
                {opp.isArchived ? <><ArchiveRestore className="w-3.5 h-3.5 mr-1.5" />Unarchive</> : <><Archive className="w-3.5 h-3.5 mr-1.5" />Archive</>}
              </Button>
            </div>

            {/* Status change */}
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Change Status</CardTitle></CardHeader>
              <CardContent className="space-y-2 pb-4">
                <div className="flex flex-wrap gap-2">
                  <Select value={newStatus} onValueChange={(v) => { setNewStatus(v); setReason(""); }}>
                    <SelectTrigger className="w-44" data-testid="select-opp-new-status"><SelectValue placeholder="New status…" /></SelectTrigger>
                    <SelectContent>{OPPORTUNITY_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                  {(needsLostReason || needsNoBidReason) && (
                    <Select value={reason} onValueChange={setReason}>
                      <SelectTrigger className="w-48" data-testid="select-opp-reason"><SelectValue placeholder="Reason *" /></SelectTrigger>
                      <SelectContent>
                        {(needsLostReason ? OPPORTUNITY_LOST_REASONS : OPPORTUNITY_NO_BID_REASONS).map(r => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button size="sm" onClick={applyStatus} disabled={!newStatus || changeStatus.isPending} data-testid="button-opp-apply-status">
                    {changeStatus.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}Apply
                  </Button>
                </div>
                {(needsLostReason || needsNoBidReason) && (
                  <Input placeholder="Optional notes" value={reasonNotes} onChange={e => setReasonNotes(e.target.value)} data-testid="input-opp-reason-notes" />
                )}
              </CardContent>
            </Card>

            {/* Contacts */}
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Contacts</CardTitle></CardHeader>
              <CardContent className="space-y-3 pb-4">
                {oppContacts.length === 0 && <p className="text-xs text-muted-foreground">No contacts linked yet.</p>}
                {oppContacts.map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-2 text-sm" data-testid={`row-opp-contact-${c.id}`}>
                    <div className="min-w-0">
                      <p className="font-medium flex items-center gap-1.5">
                        {c.isPrimary && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                        {c.firstName} {c.lastName ?? ""}
                        {c.role && <Badge variant="outline" className="text-[10px]">{labelFor(OPPORTUNITY_CONTACT_ROLES, c.role)}</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">{[c.jobTitle, c.email, c.mobilePhone || c.officePhone].filter(Boolean).join(" · ")}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {!c.isPrimary && (
                        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => updateContact.mutate({ id: c.id, isPrimary: true })} data-testid={`button-make-primary-${c.id}`}>
                          Make primary
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeContact.mutate(c.id)} data-testid={`button-remove-contact-${c.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-border">
                  <div>
                    <Label className="text-xs">Add contact</Label>
                    <Select value={contactId} onValueChange={setContactId}>
                      <SelectTrigger className="w-44" data-testid="select-add-contact"><SelectValue placeholder="Pick contact…" /></SelectTrigger>
                      <SelectContent>
                        {availableContacts.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.firstName} {c.lastName ?? ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Role</Label>
                    <Select value={contactRole || "none"} onValueChange={v => setContactRole(v === "none" ? "" : v)}>
                      <SelectTrigger className="w-40" data-testid="select-add-contact-role"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {OPPORTUNITY_CONTACT_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-1.5 text-xs pb-2.5 cursor-pointer">
                    <Checkbox checked={contactPrimary} onCheckedChange={c => setContactPrimary(c === true)} />Primary
                  </label>
                  <Button
                    size="sm"
                    disabled={!contactId || addContact.isPending}
                    onClick={() => addContact.mutate(
                      { contactId: Number(contactId), role: contactRole || null, isPrimary: contactPrimary },
                      {
                        onSuccess: () => { setContactId(""); setContactRole(""); setContactPrimary(false); },
                        onError: (err) => toast({ title: "Couldn't add contact", description: extractApiError(err, "Try again."), variant: "destructive" }),
                      },
                    )}
                    data-testid="button-add-contact"
                  >
                    Add
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Status history */}
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Status History</CardTitle></CardHeader>
              <CardContent className="pb-4">
                {history.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No status changes yet.</p>
                ) : (
                  <ul className="space-y-1.5 text-xs">
                    {history.map(h => (
                      <li key={h.id} data-testid={`row-status-history-${h.id}`}>
                        <span className="font-medium">
                          {h.previousStatus ? `${getOpportunityStatusLabel(h.previousStatus)} → ` : ""}{getOpportunityStatusLabel(h.newStatus)}
                        </span>
                        <span className="text-muted-foreground"> — {h.changedByName || "System"}, {h.changedAt ? new Date(h.changedAt).toLocaleString() : ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
