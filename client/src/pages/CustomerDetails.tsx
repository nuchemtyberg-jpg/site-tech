import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Building2, Mail, Phone, Globe, MapPin, Pencil, Plus, Star,
  Archive, Trash2, AlertTriangle, MessageSquare, FolderOpen, Users, History,
  UserX, UserCheck, FileText,
} from "lucide-react";
import { format } from "date-fns";
import {
  CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS, CUSTOMER_STATUSES, CONTACT_ROLES, CONTACT_ROLE_LABELS,
  type Customer, type Contact, type Project, type Communication, type CustomerType, type ContactRole,
} from "@shared/schema";

type ActivityEntry = {
  id: number;
  action: string;
  description: string;
  actorName: string | null;
  createdAt: string;
};

const NONE_VALUE = "__none__";

// ---------- Contact form dialog (add + edit) ----------

type ContactFormState = {
  firstName: string;
  lastName: string;
  jobTitle: string;
  roles: ContactRole[];
  email: string;
  officePhone: string;
  mobilePhone: string;
  extension: string;
  notes: string;
  isPrimary: boolean;
};

const emptyContactForm: ContactFormState = {
  firstName: "", lastName: "", jobTitle: "", roles: [], email: "",
  officePhone: "", mobilePhone: "", extension: "", notes: "", isPrimary: false,
};

function ContactDialog({
  customerId, contact, open, onOpenChange,
}: {
  customerId: number;
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [formState, setFormState] = useState<ContactFormState>(emptyContactForm);
  const [dupEmails, setDupEmails] = useState<Contact[]>([]);

  useEffect(() => {
    if (open) {
      setFormState(contact ? {
        firstName: contact.firstName,
        lastName: contact.lastName || "",
        jobTitle: contact.jobTitle || "",
        roles: (contact.roles || []) as ContactRole[],
        email: contact.email || "",
        officePhone: contact.officePhone || "",
        mobilePhone: contact.mobilePhone || "",
        extension: contact.extension || "",
        notes: contact.notes || "",
        isPrimary: contact.isPrimary,
      } : emptyContactForm);
      setDupEmails([]);
    }
  }, [open, contact]);

  // Non-blocking duplicate-email warning
  useEffect(() => {
    if (!open || !formState.email.trim() || !formState.email.includes("@")) {
      setDupEmails([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ email: formState.email.trim() });
        if (contact) params.set("excludeId", String(contact.id));
        const res = await fetch(`/api/customers/${customerId}/contacts/duplicate-check?${params}`, { credentials: "include" });
        if (res.ok) setDupEmails(await res.json());
      } catch {
        // best-effort only
      }
    }, 400);
    return () => clearTimeout(t);
  }, [formState.email, open, contact, customerId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        firstName: formState.firstName.trim(),
        lastName: formState.lastName.trim() || null,
        jobTitle: formState.jobTitle.trim() || null,
        roles: formState.roles,
        email: formState.email.trim() || null,
        officePhone: formState.officePhone.trim() || null,
        mobilePhone: formState.mobilePhone.trim() || null,
        extension: formState.extension.trim() || null,
        notes: formState.notes.trim() || null,
        isPrimary: formState.isPrimary,
      };
      if (contact) {
        return apiRequest("PUT", `/api/contacts/${contact.id}`, payload);
      }
      return apiRequest("POST", `/api/customers/${customerId}/contacts`, { ...payload, isActive: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/customers/${customerId}/contacts`] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: [`/api/customers/${customerId}/activity`] });
      onOpenChange(false);
      toast({ title: contact ? "Contact updated" : "Contact added" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save contact", description: err.message, variant: "destructive" });
    },
  });

  const toggleRole = (role: ContactRole) => {
    setFormState((prev) => ({
      ...prev,
      roles: prev.roles.includes(role) ? prev.roles.filter((r) => r !== role) : [...prev.roles, role],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit Contact" : "Add Contact"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!formState.firstName.trim()) {
              toast({ title: "First name is required", variant: "destructive" });
              return;
            }
            saveMutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>First Name *</Label>
              <Input
                value={formState.firstName}
                onChange={(e) => setFormState({ ...formState, firstName: e.target.value })}
                data-testid="input-contact-first-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name</Label>
              <Input
                value={formState.lastName}
                onChange={(e) => setFormState({ ...formState, lastName: e.target.value })}
                data-testid="input-contact-last-name"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Job Title</Label>
            <Input
              value={formState.jobTitle}
              onChange={(e) => setFormState({ ...formState, jobTitle: e.target.value })}
              placeholder="Senior Estimator"
              data-testid="input-contact-job-title"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Role(s)</Label>
            <div className="flex flex-wrap gap-2">
              {CONTACT_ROLES.map((role) => (
                <Badge
                  key={role}
                  variant={formState.roles.includes(role) ? "default" : "outline"}
                  className="cursor-pointer select-none"
                  onClick={() => toggleRole(role)}
                  data-testid={`badge-role-${role}`}
                >
                  {CONTACT_ROLE_LABELS[role]}
                </Badge>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              type="email"
              value={formState.email}
              onChange={(e) => setFormState({ ...formState, email: e.target.value })}
              data-testid="input-contact-email"
            />
          </div>
          {dupEmails.length > 0 && (
            <div className="rounded-md border border-yellow-400/50 bg-yellow-50 dark:bg-yellow-950/30 p-3 text-sm" data-testid="warning-duplicate-contact-email">
              <div className="flex items-center gap-2 font-medium text-yellow-800 dark:text-yellow-300">
                <AlertTriangle className="w-4 h-4" />
                A contact with this email already exists
              </div>
              <p className="text-muted-foreground mt-1">
                {dupEmails.map((c) => `${c.firstName} ${c.lastName || ""}`.trim()).join(", ")} already uses this email. You can still save.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Office Phone</Label>
              <Input
                type="tel"
                value={formState.officePhone}
                onChange={(e) => setFormState({ ...formState, officePhone: e.target.value })}
                data-testid="input-contact-office-phone"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mobile Phone</Label>
              <Input
                type="tel"
                value={formState.mobilePhone}
                onChange={(e) => setFormState({ ...formState, mobilePhone: e.target.value })}
                data-testid="input-contact-mobile-phone"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Extension</Label>
              <Input
                value={formState.extension}
                onChange={(e) => setFormState({ ...formState, extension: e.target.value })}
                data-testid="input-contact-extension"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              value={formState.notes}
              onChange={(e) => setFormState({ ...formState, notes: e.target.value })}
              data-testid="input-contact-notes"
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={formState.isPrimary}
              onCheckedChange={(checked) => setFormState({ ...formState, isPrimary: checked })}
              data-testid="switch-contact-primary"
            />
            <div>
              <Label>Primary Contact</Label>
              <p className="text-xs text-muted-foreground">Marking this contact as primary will replace the current primary contact.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-contact">
              {saveMutation.isPending ? "Saving..." : contact ? "Save Changes" : "Add Contact"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Edit customer dialog ----------

function EditCustomerDialog({
  customer, open, onOpenChange,
}: {
  customer: Customer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "", customerType: "", status: "active", phone: "", email: "",
    website: "", address: "", city: "", state: "", zip: "", notes: "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: customer.name,
        customerType: customer.customerType || "",
        status: customer.status || "active",
        phone: customer.phone || "",
        email: customer.email || "",
        website: customer.website || "",
        address: customer.address || "",
        city: customer.city || "",
        state: customer.state || "",
        zip: customer.zip || "",
        notes: customer.notes || "",
      });
    }
  }, [open, customer]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", `/api/customers/${customer.id}`, {
        name: form.name.trim(),
        customerType: form.customerType || null,
        status: form.status,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        zip: form.zip.trim() || null,
        notes: form.notes.trim() || null,
        nameNeedsReview: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/customers/${customer.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: [`/api/customers/${customer.id}/activity`] });
      onOpenChange(false);
      toast({ title: "Customer updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update customer", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.name.trim()) {
              toast({ title: "Company name is required", variant: "destructive" });
              return;
            }
            updateMutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label>Company Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-edit-name" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Customer Type</Label>
              <Select value={form.customerType || undefined} onValueChange={(v) => setForm({ ...form, customerType: v })}>
                <SelectTrigger data-testid="select-edit-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOMER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{CUSTOMER_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger data-testid="select-edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOMER_STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Main Phone</Label>
              <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-edit-phone" />
            </div>
            <div className="space-y-1.5">
              <Label>General Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-edit-email" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Website</Label>
            <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} data-testid="input-edit-website" />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="input-edit-address" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} data-testid="input-edit-city" />
            </div>
            <div className="space-y-1.5">
              <Label>State</Label>
              <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} data-testid="input-edit-state" />
            </div>
            <div className="space-y-1.5">
              <Label>ZIP</Label>
              <Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} data-testid="input-edit-zip" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-edit-notes" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-edit-customer">
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Main page ----------

export default function CustomerDetails() {
  const { id } = useParams<{ id: string }>();
  const customerId = Number(id);
  const { toast } = useToast();
  const { isAdmin } = useAuth();

  const [editOpen, setEditOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [commFormOpen, setCommFormOpen] = useState(false);
  const [commForm, setCommForm] = useState({
    type: "phone", subject: "", notes: "", contactId: NONE_VALUE, projectId: NONE_VALUE,
  });

  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: [`/api/customers/${customerId}`],
    enabled: !isNaN(customerId),
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: [`/api/customers/${customerId}/contacts`],
    enabled: !isNaN(customerId),
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: [`/api/customers/${customerId}/projects`],
    enabled: !isNaN(customerId),
  });

  const { data: communications = [] } = useQuery<Communication[]>({
    queryKey: [`/api/customers/${customerId}/communications`],
    enabled: !isNaN(customerId),
  });

  const { data: activity = [] } = useQuery<ActivityEntry[]>({
    queryKey: [`/api/customers/${customerId}/activity`],
    enabled: !isNaN(customerId),
  });

  const activeContacts = contacts.filter((c) => c.isActive);
  const inactiveContacts = contacts.filter((c) => !c.isActive);
  const visibleContacts = showInactive ? contacts : activeContacts;
  const contactById = (cid: number | null) => contacts.find((c) => c.id === cid);
  const projectById = (pid: number | null) => projects.find((p) => p.id === pid);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/customers/${customerId}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/customers/${customerId}/contacts`] });
    queryClient.invalidateQueries({ queryKey: [`/api/customers/${customerId}/activity`] });
    queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
  };

  const toggleContactActiveMutation = useMutation({
    mutationFn: async ({ contact, isActive }: { contact: Contact; isActive: boolean }) => {
      return apiRequest("PUT", `/api/contacts/${contact.id}`, { isActive, ...(isActive ? {} : { isPrimary: false }) });
    },
    onSuccess: (_data, vars) => {
      invalidateAll();
      toast({ title: vars.isActive ? "Contact reactivated" : "Contact deactivated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update contact", description: err.message, variant: "destructive" });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: number) => {
      return apiRequest("DELETE", `/api/contacts/${contactId}`);
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Contact deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Cannot delete contact", description: err.message.replace(/^\d+:\s*/, ""), variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/customers/${customerId}/archive`),
    onSuccess: () => {
      invalidateAll();
      setArchiveConfirmOpen(false);
      toast({ title: "Customer archived", description: "All history is preserved. Find it under the Archived filter." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to archive", description: err.message, variant: "destructive" });
    },
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/customers/${customerId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Customer deleted" });
      window.location.href = "/customers";
    },
    onError: (err: Error) => {
      setDeleteConfirmOpen(false);
      toast({ title: "Cannot delete customer", description: err.message.replace(/^\d+:\s*/, ""), variant: "destructive" });
    },
  });

  const logCommMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/customers/${customerId}/communications`, {
        type: commForm.type,
        subject: commForm.subject.trim() || null,
        notes: commForm.notes.trim() || null,
        contactDate: new Date().toISOString(),
        contactId: commForm.contactId !== NONE_VALUE ? Number(commForm.contactId) : null,
        projectId: commForm.projectId !== NONE_VALUE ? Number(commForm.projectId) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/customers/${customerId}/communications`] });
      queryClient.invalidateQueries({ queryKey: [`/api/customers/${customerId}/activity`] });
      setCommFormOpen(false);
      setCommForm({ type: "phone", subject: "", notes: "", contactId: NONE_VALUE, projectId: NONE_VALUE });
      toast({ title: "Communication logged" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to log communication", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-muted rounded w-64 animate-pulse" />
        <div className="h-40 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">Customer not found</h2>
        <Link href="/customers">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Customers
          </Button>
        </Link>
      </div>
    );
  }

  const addressLine = [customer.address, [customer.city, customer.state].filter(Boolean).join(", "), customer.zip]
    .filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Link href="/customers" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit">
          <ArrowLeft className="w-4 h-4" />
          Back to Customers
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Building2 className="w-6 h-6 text-muted-foreground shrink-0" />
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight break-words" data-testid="text-customer-name">
                {customer.name}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {customer.customerType && (
                <Badge variant="secondary">
                  {CUSTOMER_TYPE_LABELS[customer.customerType as CustomerType] || customer.customerType}
                </Badge>
              )}
              <Badge variant={customer.status === "active" ? "default" : "outline"} className="capitalize" data-testid="badge-customer-status">
                {customer.status}
              </Badge>
              {customer.nameNeedsReview && (
                <Badge variant="outline" className="text-yellow-700 dark:text-yellow-400 border-yellow-400">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  Company name needs review
                </Badge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditOpen(true)} data-testid="button-edit-customer">
              <Pencil className="w-4 h-4 mr-2" />
              Edit Customer
            </Button>
            {customer.status !== "archived" && (
              <Button variant="outline" onClick={() => setArchiveConfirmOpen(true)} data-testid="button-archive-customer">
                <Archive className="w-4 h-4 mr-2" />
                Archive
              </Button>
            )}
            {isAdmin && (
              <Button variant="outline" className="text-destructive" onClick={() => setDeleteConfirmOpen(true)} data-testid="button-delete-customer">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Company info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Company Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {customer.phone && (
            <a href={`tel:${customer.phone}`} className="flex items-center gap-2 text-foreground hover:text-primary" data-testid="link-customer-phone">
              <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
              {customer.phone}
            </a>
          )}
          {customer.email && (
            <a href={`mailto:${customer.email}`} className="flex items-center gap-2 text-foreground hover:text-primary truncate" data-testid="link-customer-email">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="truncate">{customer.email}</span>
            </a>
          )}
          {customer.website && (
            <a
              href={customer.website.startsWith("http") ? customer.website : `https://${customer.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-foreground hover:text-primary truncate"
              data-testid="link-customer-website"
            >
              <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="truncate">{customer.website}</span>
            </a>
          )}
          {addressLine && (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
              {addressLine}
            </div>
          )}
          {customer.notes && (
            <div className="flex items-start gap-2 sm:col-span-2">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <span className="whitespace-pre-wrap">{customer.notes}</span>
            </div>
          )}
          {!customer.phone && !customer.email && !customer.website && !addressLine && !customer.notes && (
            <p className="text-muted-foreground sm:col-span-2">No company details yet. Use Edit Customer to add them.</p>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="contacts">
        <TabsList className="w-full sm:w-auto flex-wrap h-auto">
          <TabsTrigger value="contacts" data-testid="tab-contacts">
            <Users className="w-4 h-4 mr-1.5" />
            Contacts ({activeContacts.length})
          </TabsTrigger>
          <TabsTrigger value="projects" data-testid="tab-projects">
            <FolderOpen className="w-4 h-4 mr-1.5" />
            Projects ({projects.length})
          </TabsTrigger>
          <TabsTrigger value="communications" data-testid="tab-communications">
            <MessageSquare className="w-4 h-4 mr-1.5" />
            Communications ({communications.length})
          </TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">
            <History className="w-4 h-4 mr-1.5" />
            Activity
          </TabsTrigger>
        </TabsList>

        {/* Contacts */}
        <TabsContent value="contacts" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={showInactive} onCheckedChange={setShowInactive} data-testid="switch-show-inactive" />
              <Label className="text-sm text-muted-foreground">
                Show inactive ({inactiveContacts.length})
              </Label>
            </div>
            <Button onClick={() => { setEditingContact(null); setContactDialogOpen(true); }} data-testid="button-add-contact">
              <Plus className="w-4 h-4 mr-2" />
              Add Contact
            </Button>
          </div>

          {visibleContacts.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No contacts yet. Add the first contact for this company.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visibleContacts.map((contact) => (
                <Card
                  key={contact.id}
                  className={contact.isActive ? "" : "opacity-60 border-dashed"}
                  data-testid={`card-contact-${contact.id}`}
                >
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">
                            {contact.firstName} {contact.lastName || ""}
                          </span>
                          {contact.isPrimary && (
                            <Badge className="text-xs" data-testid={`badge-primary-${contact.id}`}>
                              <Star className="w-3 h-3 mr-1" />
                              Primary
                            </Badge>
                          )}
                          {!contact.isActive && (
                            <Badge variant="outline" className="text-xs">Inactive</Badge>
                          )}
                        </div>
                        {contact.jobTitle && (
                          <p className="text-sm text-muted-foreground">{contact.jobTitle}</p>
                        )}
                      </div>
                    </div>
                    {(contact.roles || []).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {(contact.roles || []).map((role) => (
                          <Badge key={role} variant="secondary" className="text-xs">
                            {CONTACT_ROLE_LABELS[role as ContactRole] || role}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="space-y-1 text-sm">
                      {contact.email && (
                        <a href={`mailto:${contact.email}`} className="flex items-center gap-2 hover:text-primary">
                          <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                          <span className="truncate">{contact.email}</span>
                        </a>
                      )}
                      {contact.officePhone && (
                        <a href={`tel:${contact.officePhone}`} className="flex items-center gap-2 hover:text-primary">
                          <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                          {contact.officePhone}
                          {contact.extension && <span className="text-muted-foreground">ext. {contact.extension}</span>}
                        </a>
                      )}
                      {contact.mobilePhone && (
                        <a href={`tel:${contact.mobilePhone}`} className="flex items-center gap-2 hover:text-primary">
                          <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                          {contact.mobilePhone}
                          <span className="text-xs text-muted-foreground">mobile</span>
                        </a>
                      )}
                      {contact.notes && (
                        <p className="text-muted-foreground text-xs whitespace-pre-wrap pt-1">{contact.notes}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditingContact(contact); setContactDialogOpen(true); }}
                        data-testid={`button-edit-contact-${contact.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1.5" />
                        Edit
                      </Button>
                      {contact.isActive ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleContactActiveMutation.mutate({ contact, isActive: false })}
                          data-testid={`button-deactivate-contact-${contact.id}`}
                        >
                          <UserX className="w-3.5 h-3.5 mr-1.5" />
                          Deactivate
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toggleContactActiveMutation.mutate({ contact, isActive: true })}
                            data-testid={`button-reactivate-contact-${contact.id}`}
                          >
                            <UserCheck className="w-3.5 h-3.5 mr-1.5" />
                            Reactivate
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            onClick={() => deleteContactMutation.mutate(contact.id)}
                            data-testid={`button-delete-contact-${contact.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Projects */}
        <TabsContent value="projects" className="space-y-4">
          {projects.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No projects for this customer yet.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {projects.map((project) => (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <Card className="hover-elevate cursor-pointer h-full" data-testid={`card-project-${project.id}`}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">{project.name}</span>
                        <Badge variant="secondary" className="capitalize shrink-0">
                          {(project.status || "").replace(/_/g, " ")}
                        </Badge>
                      </div>
                      {project.streetAddress && (
                        <p className="text-sm text-muted-foreground mt-1 truncate">{project.streetAddress}</p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Communications */}
        <TabsContent value="communications" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setCommFormOpen(true)} data-testid="button-log-communication">
              <Plus className="w-4 h-4 mr-2" />
              Log Communication
            </Button>
          </div>

          <Dialog open={commFormOpen} onOpenChange={setCommFormOpen}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Log Communication</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  logCommMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={commForm.type} onValueChange={(v) => setCommForm({ ...commForm, type: v })}>
                    <SelectTrigger data-testid="select-comm-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="phone">Phone Call</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="meeting">Meeting</SelectItem>
                      <SelectItem value="text">Text Message</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Contact (optional)</Label>
                    <Select value={commForm.contactId} onValueChange={(v) => setCommForm({ ...commForm, contactId: v })}>
                      <SelectTrigger data-testid="select-comm-contact">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>None</SelectItem>
                        {contacts.filter((c) => c.isActive).map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.firstName} {c.lastName || ""}{c.isPrimary ? " (Primary)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Project (optional)</Label>
                    <Select value={commForm.projectId} onValueChange={(v) => setCommForm({ ...commForm, projectId: v })}>
                      <SelectTrigger data-testid="select-comm-project">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>None</SelectItem>
                        {projects.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Subject</Label>
                  <Input
                    value={commForm.subject}
                    onChange={(e) => setCommForm({ ...commForm, subject: e.target.value })}
                    placeholder="Discussed upcoming bid"
                    data-testid="input-comm-subject"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea
                    value={commForm.notes}
                    onChange={(e) => setCommForm({ ...commForm, notes: e.target.value })}
                    data-testid="input-comm-notes"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setCommFormOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={logCommMutation.isPending} data-testid="button-save-communication">
                    {logCommMutation.isPending ? "Saving..." : "Log Communication"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {communications.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No communications logged yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {communications.map((comm) => {
                const linkedContact = contactById(comm.contactId);
                const linkedProject = projectById(comm.projectId);
                return (
                  <Card key={comm.id} data-testid={`card-communication-${comm.id}`}>
                    <CardContent className="pt-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="capitalize">{comm.type}</Badge>
                        {comm.subject && <span className="font-medium">{comm.subject}</span>}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {comm.contactDate ? format(new Date(comm.contactDate), "MMM d, yyyy h:mm a") : ""}
                        </span>
                      </div>
                      {(linkedContact || linkedProject) && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {linkedContact && (
                            <Badge variant="outline" className="text-xs">
                              <Users className="w-3 h-3 mr-1" />
                              {linkedContact.firstName} {linkedContact.lastName || ""}
                            </Badge>
                          )}
                          {linkedProject && (
                            <Badge variant="outline" className="text-xs">
                              <FolderOpen className="w-3 h-3 mr-1" />
                              {linkedProject.name}
                            </Badge>
                          )}
                        </div>
                      )}
                      {comm.notes && (
                        <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{comm.notes}</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Activity */}
        <TabsContent value="activity" className="space-y-4">
          {activity.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No activity recorded yet.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-4 divide-y">
                {activity.map((entry) => (
                  <div key={entry.id} className="py-3 first:pt-0 last:pb-0" data-testid={`activity-entry-${entry.id}`}>
                    <p className="text-sm">{entry.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {entry.actorName ? `${entry.actorName} · ` : ""}
                      {format(new Date(entry.createdAt), "MMM d, yyyy h:mm a")}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <EditCustomerDialog customer={customer} open={editOpen} onOpenChange={setEditOpen} />
      <ContactDialog
        customerId={customerId}
        contact={editingContact}
        open={contactDialogOpen}
        onOpenChange={setContactDialogOpen}
      />

      <AlertDialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this customer?</AlertDialogTitle>
            <AlertDialogDescription>
              {customer.name} will be hidden from the default customer list, but all projects, communications, and contacts stay intact. You can find archived customers with the status filter and restore them anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => archiveMutation.mutate()} data-testid="button-confirm-archive">
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Deletion is only allowed when the customer has no projects or communications — otherwise archive it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteCustomerMutation.mutate()}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
