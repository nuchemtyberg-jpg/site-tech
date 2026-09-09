import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { extractApiError, useAppUsers, userDisplayName } from "@/hooks/use-todos";
import { useCreateOpportunity, useUpdateOpportunity } from "@/hooks/use-opportunities";
import { CustomerCreationDialog } from "@/components/CustomerCreationDialog";
import { OPPORTUNITY_PROJECT_TYPES, OPPORTUNITY_SOURCES } from "@shared/opportunityStatus";
import type { Customer, OpportunityWithDetails } from "@shared/schema";

type FormState = {
  name: string; customerId: string; status: string; responsibleUserId: string;
  streetAddress: string; city: string; state: string; zip: string;
  rfpReceivedDate: string; bidDueDate: string; bidDueTime: string; estimatedStartDate: string;
  source: string; projectType: string; scopeSummary: string; internalNotes: string;
  expectedValue: string; probability: string;
};
const empty: FormState = {
  name: "", customerId: "", status: "new", responsibleUserId: "", streetAddress: "", city: "", state: "", zip: "",
  rfpReceivedDate: "", bidDueDate: "", bidDueTime: "", estimatedStartDate: "", source: "", projectType: "",
  scopeSummary: "", internalNotes: "", expectedValue: "", probability: "",
};

export function OpportunityFormDialog({ open, onOpenChange, opportunity, onSaved }: {
  open: boolean; onOpenChange: (open: boolean) => void; opportunity?: OpportunityWithDetails | null;
  onSaved?: (id: number) => void;
}) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [form, setForm] = useState(empty);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newlySelectedCustomer, setNewlySelectedCustomer] = useState<Pick<Customer, "id" | "name"> | null>(null);
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: users = [] } = useAppUsers();
  const create = useCreateOpportunity();
  const update = useUpdateOpportunity();
  useEffect(() => {
    if (!open) {
      setAddingCustomer(false);
      setNewlySelectedCustomer(null);
      return;
    }
    setForm(opportunity ? {
      name: opportunity.name, customerId: String(opportunity.customerId), status: opportunity.status,
      responsibleUserId: opportunity.responsibleUserId || "", streetAddress: opportunity.streetAddress || "",
      city: opportunity.city || "", state: opportunity.state || "", zip: opportunity.zip || "",
      rfpReceivedDate: opportunity.rfpReceivedDate || "", bidDueDate: opportunity.bidDueDate || "",
      bidDueTime: opportunity.bidDueTime || "", estimatedStartDate: opportunity.estimatedStartDate || "",
      source: opportunity.source || "", projectType: opportunity.projectType || "",
      scopeSummary: opportunity.scopeSummary || "", internalNotes: opportunity.internalNotes || "",
      expectedValue: opportunity.expectedValue == null ? "" : String(opportunity.expectedValue),
      probability: opportunity.probability == null ? "" : String(opportunity.probability),
    } : empty);
  }, [open, opportunity]);

  const field = (key: keyof FormState) => (value: string) => setForm(current => ({ ...current, [key]: value }));
  const customerOptions = newlySelectedCustomer && !customers.some(customer => customer.id === newlySelectedCustomer.id)
    ? [...customers, newlySelectedCustomer]
    : customers;
  const selectNewCustomer = (customer: Pick<Customer, "id" | "name">) => {
    setNewlySelectedCustomer(customer);
    setForm(current => ({ ...current, customerId: String(customer.id) }));
  };
  const save = (confirmRemoveContacts = false) => {
    if (!form.name.trim() || !form.customerId) {
      toast({ title: "Name and customer are required", variant: "destructive" }); return;
    }
    const common = {
      name: form.name.trim(), customerId: Number(form.customerId),
      responsibleUserId: form.responsibleUserId || null, streetAddress: form.streetAddress || null,
      city: form.city || null, state: form.state || null, zip: form.zip || null,
      rfpReceivedDate: form.rfpReceivedDate || null, bidDueDate: form.bidDueDate || null,
      bidDueTime: form.bidDueTime || null, estimatedStartDate: form.estimatedStartDate || null,
      source: (form.source || null) as any, projectType: (form.projectType || null) as any,
      scopeSummary: form.scopeSummary || null, internalNotes: form.internalNotes || null,
      ...(isAdmin ? {
        expectedValue: form.expectedValue ? Number(form.expectedValue) : null,
        probability: form.probability ? Number(form.probability) : null,
      } : {}),
    };
    const success = (result: { id: number }) => {
      toast({ title: opportunity ? "Opportunity updated" : "Opportunity created" });
      onOpenChange(false); onSaved?.(result.id);
    };
    const failure = (error: unknown) => {
      const message = extractApiError(error, "Please try again.");
      if (opportunity && error instanceof Error && error.message.startsWith("409") && window.confirm(message)) save(true);
      else toast({ title: "Couldn't save opportunity", description: message, variant: "destructive" });
    };
    if (opportunity) update.mutate({ id: opportunity.id, ...common, confirmRemoveContacts }, { onSuccess: success, onError: failure });
    else create.mutate({ ...common, status: "new" }, { onSuccess: success, onError: failure });
  };
  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{opportunity ? `Edit ${opportunity.opportunityNumber}` : "New Bid Opportunity"}</DialogTitle>
          <DialogDescription>Start with the essentials. You can add the rest later.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><Label>Name *</Label><Input className="min-h-11" value={form.name} onChange={e => field("name")(e.target.value)} data-testid="input-opportunity-name" /></div>
            <div><Label>Customer *</Label><Select value={form.customerId} onValueChange={field("customerId")}><SelectTrigger className="min-h-11" data-testid="select-opp-customer"><SelectValue placeholder="Choose customer" /></SelectTrigger><SelectContent>{customerOptions.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select><Button type="button" variant="link" className="px-0 min-h-11" onClick={() => setAddingCustomer(true)} data-testid="button-add-inline-customer"><Plus className="w-4 h-4 mr-1" />Add new customer</Button></div>
          <div><Label>Responsible</Label><Select value={form.responsibleUserId || "none"} onValueChange={v => field("responsibleUserId")(v === "none" ? "" : v)}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{users.map(u => <SelectItem key={u.id} value={u.id}>{userDisplayName(u)}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Bid due</Label><div className="flex gap-2"><Input className="min-h-11 min-w-0" type="date" value={form.bidDueDate} onChange={e => field("bidDueDate")(e.target.value)} /><Input className="min-h-11 w-28" type="time" value={form.bidDueTime} onChange={e => field("bidDueTime")(e.target.value)} /></div></div>
          <div><Label>Source</Label><Select value={form.source || "none"} onValueChange={v => field("source")(v === "none" ? "" : v)}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Not set</SelectItem>{OPPORTUNITY_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Project type</Label><Select value={form.projectType || "none"} onValueChange={v => field("projectType")(v === "none" ? "" : v)}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Not set</SelectItem>{OPPORTUNITY_PROJECT_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
          {isAdmin && <div><Label>Expected value</Label><Input className="min-h-11" type="number" min="0" value={form.expectedValue} onChange={e => field("expectedValue")(e.target.value)} /></div>}
          {isAdmin && <div><Label>Probability %</Label><Input className="min-h-11" type="number" min="0" max="100" value={form.probability} onChange={e => field("probability")(e.target.value)} /></div>}
          <div className="sm:col-span-2"><Label>Street address</Label><Input className="min-h-11" value={form.streetAddress} onChange={e => field("streetAddress")(e.target.value)} /></div>
          <div><Label>City</Label><Input className="min-h-11" value={form.city} onChange={e => field("city")(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2"><div><Label>State</Label><Input className="min-h-11" value={form.state} onChange={e => field("state")(e.target.value)} /></div><div><Label>ZIP</Label><Input className="min-h-11" value={form.zip} onChange={e => field("zip")(e.target.value)} /></div></div>
          <div><Label>RFP received</Label><Input className="min-h-11" type="date" value={form.rfpReceivedDate} onChange={e => field("rfpReceivedDate")(e.target.value)} /></div>
          <div><Label>Estimated start</Label><Input className="min-h-11" type="date" value={form.estimatedStartDate} onChange={e => field("estimatedStartDate")(e.target.value)} /></div>
          <div className="sm:col-span-2"><Label>Scope summary</Label><Textarea value={form.scopeSummary} onChange={e => field("scopeSummary")(e.target.value)} /></div>
          <div className="sm:col-span-2"><Label>Internal notes</Label><Textarea value={form.internalNotes} onChange={e => field("internalNotes")(e.target.value)} /></div>
        </div>
        <DialogFooter><Button className="min-h-11" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button className="min-h-11" disabled={pending} onClick={() => save()}>{pending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}{opportunity ? "Save changes" : "Create opportunity"}</Button></DialogFooter>
      </DialogContent>
      <CustomerCreationDialog
        open={addingCustomer}
        onOpenChange={setAddingCustomer}
        onCreated={selectNewCustomer}
        onSelectExisting={selectNewCustomer}
      />
    </Dialog>
  );
}