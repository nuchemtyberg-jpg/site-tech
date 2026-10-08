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
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { OPPORTUNITY_PROJECT_TYPES, OPPORTUNITY_SOURCES } from "@shared/opportunityStatus";
import type { Customer, OpportunityWithDetails } from "@shared/schema";

type FormState = {
  name: string; customerId: string; targetProjectId: string; status: string; responsibleUserId: string;
  streetAddress: string; address2: string; city: string; state: string; zip: string;
  rfpReceivedDate: string; bidDueDate: string; bidDueTime: string; estimatedStartDate: string;
  source: string; projectType: string; scopeSummary: string; internalNotes: string;
  expectedValue: string; probability: string;
};
const empty: FormState = {
  name: "", customerId: "", targetProjectId: "", status: "new", responsibleUserId: "", streetAddress: "", address2: "", city: "", state: "", zip: "",
  rfpReceivedDate: "", bidDueDate: "", bidDueTime: "", estimatedStartDate: "", source: "", projectType: "",
  scopeSummary: "", internalNotes: "", expectedValue: "", probability: "",
};
const addressFields = [
  ["streetAddress", "Street address"],
  ["city", "City"],
  ["state", "State"],
  ["zip", "ZIP"],
] as const;
type AddressField = typeof addressFields[number][0];

export function OpportunityFormDialog({ open, onOpenChange, opportunity, onSaved, defaultProjectId, defaultCustomerId, defaultProjectName, defaultAddress }: {
  open: boolean; onOpenChange: (open: boolean) => void; opportunity?: OpportunityWithDetails | null;
  onSaved?: (id: number) => void;
  defaultProjectId?: number; defaultCustomerId?: number; defaultProjectName?: string;
  defaultAddress?: { streetAddress?: string | null; address2?: string | null; city?: string | null; state?: string | null; zip?: string | null };
}) {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [form, setForm] = useState(empty);
  const [addressValidationAttempted, setAddressValidationAttempted] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newlySelectedCustomer, setNewlySelectedCustomer] = useState<Pick<Customer, "id" | "name"> | null>(null);
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: projects = [] } = useQuery<any[]>({ queryKey: ["/api/projects"] });
  const { data: users = [] } = useAppUsers();
  const create = useCreateOpportunity();
  const update = useUpdateOpportunity();
  const awarded = opportunity?.status === "awarded";
  useEffect(() => {
    setAddressValidationAttempted(false);
    if (!open) {
      setAddingCustomer(false);
      setNewlySelectedCustomer(null);
      return;
    }
    setForm(opportunity ? {
      name: opportunity.name, customerId: String(opportunity.customerId), targetProjectId: String((opportunity as any).targetProjectId || ""), status: opportunity.status,
      responsibleUserId: opportunity.responsibleUserId || "", streetAddress: opportunity.streetAddress || "",
      address2: (opportunity as any).address2 || "",
      city: opportunity.city || "", state: opportunity.state || "", zip: opportunity.zip || "",
      rfpReceivedDate: opportunity.rfpReceivedDate || "", bidDueDate: opportunity.bidDueDate || "",
      bidDueTime: opportunity.bidDueTime || "", estimatedStartDate: opportunity.estimatedStartDate || "",
      source: opportunity.source || "", projectType: opportunity.projectType || "",
      scopeSummary: opportunity.scopeSummary || "", internalNotes: opportunity.internalNotes || "",
      expectedValue: opportunity.expectedValue == null ? "" : String(opportunity.expectedValue),
      probability: opportunity.probability == null ? "" : String(opportunity.probability),
    } : {
      ...empty, name: defaultProjectName ? `${defaultProjectName} — additional scope` : "",
      customerId: defaultCustomerId ? String(defaultCustomerId) : "",
      targetProjectId: defaultProjectId ? String(defaultProjectId) : "",
      streetAddress: defaultAddress?.streetAddress || "", address2: defaultAddress?.address2 || "", city: defaultAddress?.city || "",
      state: defaultAddress?.state || "", zip: defaultAddress?.zip || "",
    });
  }, [open, opportunity, defaultProjectId, defaultCustomerId, defaultProjectName, defaultAddress?.streetAddress, defaultAddress?.address2, defaultAddress?.city, defaultAddress?.state, defaultAddress?.zip]);

  const field = (key: keyof FormState) => (value: string) => setForm(current => ({ ...current, [key]: value }));
  const customerOptions = newlySelectedCustomer && !customers.some(customer => customer.id === newlySelectedCustomer.id)
    ? [...customers, newlySelectedCustomer]
    : customers;
  const selectNewCustomer = (customer: Pick<Customer, "id" | "name">) => {
    setNewlySelectedCustomer(customer);
    setForm(current => ({ ...current, customerId: String(customer.id), targetProjectId: "" }));
  };
  const save = (confirmRemoveContacts = false) => {
    if (!opportunity) {
      setAddressValidationAttempted(true);
      const missing = addressFields.find(([key]) => !form[key].trim());
      if (missing) {
        toast({ title: "Complete the opportunity address", description: "Street address, city, state, and ZIP are required.", variant: "destructive" });
        document.getElementById(`opportunity-${missing[0]}`)?.focus();
        return;
      }
    }
    if (!form.name.trim() || !form.customerId) {
      toast({ title: "Name and customer are required", variant: "destructive" }); return;
    }
    const common = {
      name: form.name.trim(),
      ...(!awarded ? {
        customerId: Number(form.customerId),
        targetProjectId: form.targetProjectId ? Number(form.targetProjectId) : null,
      } : {}),
      responsibleUserId: form.responsibleUserId || null, streetAddress: form.streetAddress || null,
      address2: form.address2 || null,
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
    if (opportunity) update.mutate({ id: opportunity.id, ...common, confirmRemoveContacts } as any, { onSuccess: success, onError: failure });
    else create.mutate({
      ...common, status: "new",
      streetAddress: form.streetAddress.trim(), city: form.city.trim(),
      state: form.state.trim(), zip: form.zip.trim(),
    } as any, { onSuccess: success, onError: failure });
  };
  const pending = create.isPending || update.isPending;
  const addressInput = (key: AddressField) => {
    const label = addressFields.find(([field]) => field === key)![1];
    const invalid = !opportunity && addressValidationAttempted && !form[key].trim();
    return <div className={key === "streetAddress" ? "sm:col-span-2" : undefined}>
      <Label htmlFor={`opportunity-${key}`}>{label}{!opportunity && " *"}</Label>
      <Input id={`opportunity-${key}`} className="min-h-11" value={form[key]}
        required={!opportunity} aria-invalid={invalid}
        aria-describedby={invalid ? `opportunity-${key}-error` : undefined}
        onChange={e => field(key)(e.target.value)} />
      {invalid && <p id={`opportunity-${key}-error`} className="text-sm text-destructive" role="alert">{label} is required</p>}
    </div>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{opportunity ? `Edit ${opportunity.opportunityNumber}` : "New Bid Opportunity"}</DialogTitle>
          <DialogDescription>{awarded
            ? "The bid remains editable, but its awarded contract snapshot is immutable. Customer and project association are locked."
            : "Start with the essentials. Fields marked with * are required."}</DialogDescription></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><Label>Name *</Label><Input className="min-h-11" value={form.name} onChange={e => field("name")(e.target.value)} data-testid="input-opportunity-name" /></div>
            <div><Label>Customer *</Label><Select disabled={awarded} value={form.customerId} onValueChange={value => setForm(current => ({ ...current, customerId: value, targetProjectId: "" }))}><SelectTrigger className="min-h-11" data-testid="select-opp-customer"><SelectValue placeholder="Choose customer" /></SelectTrigger><SelectContent>{customerOptions.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select>{!awarded && <Button type="button" variant="link" className="px-0 min-h-11" onClick={() => setAddingCustomer(true)} data-testid="button-add-inline-customer"><Plus className="w-4 h-4 mr-1" />Add new customer</Button>}</div>
           <div className="sm:col-span-2"><Label>Link to project (optional)</Label><Select disabled={awarded} value={form.targetProjectId || "none"} onValueChange={v => field("targetProjectId")(v === "none" ? "" : v)}><SelectTrigger className="min-h-11"><SelectValue placeholder="Create a new project if awarded" /></SelectTrigger><SelectContent><SelectItem value="none">Create a new project if awarded</SelectItem>{projects.filter(p => Number(p.customerId) === Number(form.customerId)).map(p => <SelectItem key={p.id} value={String(p.id)}>{p.projectNumber ? `${p.projectNumber} · ` : ""}{p.name}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground mt-1">{awarded ? "Awarded bids cannot be retargeted." : "Only projects for the selected customer are shown. The project is validated again when saved."}</p></div>
          <div><Label>Responsible</Label><Select value={form.responsibleUserId || "none"} onValueChange={v => field("responsibleUserId")(v === "none" ? "" : v)}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Unassigned</SelectItem>{users.map(u => <SelectItem key={u.id} value={u.id}>{userDisplayName(u)}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Bid due</Label><div className="flex gap-2"><Input className="min-h-11 min-w-0" type="date" value={form.bidDueDate} onChange={e => field("bidDueDate")(e.target.value)} /><Input className="min-h-11 w-28" type="time" value={form.bidDueTime} onChange={e => field("bidDueTime")(e.target.value)} /></div></div>
          <div><Label>Source</Label><Select value={form.source || "none"} onValueChange={v => field("source")(v === "none" ? "" : v)}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Not set</SelectItem>{OPPORTUNITY_SOURCES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Project type</Label><Select value={form.projectType || "none"} onValueChange={v => field("projectType")(v === "none" ? "" : v)}><SelectTrigger className="min-h-11"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Not set</SelectItem>{OPPORTUNITY_PROJECT_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
          {isAdmin && <div><Label>Expected value</Label><Input className="min-h-11" type="number" min="0" value={form.expectedValue} onChange={e => field("expectedValue")(e.target.value)} /></div>}
          {isAdmin && <div><Label>Probability %</Label><Input className="min-h-11" type="number" min="0" max="100" value={form.probability} onChange={e => field("probability")(e.target.value)} /></div>}
          <div className="sm:col-span-2">
            <Label htmlFor="opportunity-address-search">Search Address</Label>
            <AddressAutocomplete key={opportunity?.id ?? "new"} id="opportunity-address-search"
              aria-describedby="opportunity-address-guidance"
              initialValue={opportunity ? [opportunity.streetAddress, (opportunity as any).address2, opportunity.city, opportunity.state, opportunity.zip].filter(Boolean).join(", ") : ""}
              onAddressSelect={address => setForm(current => ({
                ...current, streetAddress: address.streetAddress, city: address.city,
                state: address.state, zip: address.zipCode,
              }))} />
            <p id="opportunity-address-guidance" className="text-xs text-muted-foreground">Type to search, or fill in the fields below manually</p>
          </div>
          {addressInput("streetAddress")}
          <div className="sm:col-span-2"><Label htmlFor="opportunity-address2">Address line 2</Label><Input id="opportunity-address2" className="min-h-11" value={form.address2} onChange={e => field("address2")(e.target.value)} /></div>
          {addressInput("city")}
          <div className="grid grid-cols-2 gap-2">{addressInput("state")}{addressInput("zip")}</div>
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