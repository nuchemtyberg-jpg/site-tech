import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Search, Phone, Mail, Building2, MapPin, Star, AlertTriangle, Users as UsersIcon, LayoutGrid, List } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS, CONTACT_ROLES, CONTACT_ROLE_LABELS,
  type Customer, type Contact, type CustomerType, type ContactRole,
} from "@shared/schema";

type CustomerListItem = Customer & {
  primaryContact: Contact | null;
  matchReason: string | null;
};

const customerFormSchema = z.object({
  // Company information
  name: z.string().min(1, "Company name is required"),
  customerType: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  website: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  notes: z.string().optional(),
  // Optional primary contact
  contactFirstName: z.string().optional(),
  contactLastName: z.string().optional(),
  contactJobTitle: z.string().optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactOfficePhone: z.string().optional(),
  contactMobilePhone: z.string().optional(),
  contactExtension: z.string().optional(),
});

type CustomerFormData = z.infer<typeof customerFormSchema>;

const STATUS_FILTERS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];

export default function Customers() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [contactRoles, setContactRoles] = useState<ContactRole[]>([]);
  const [duplicates, setDuplicates] = useState<{ id: number; name: string }[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: customers = [], isLoading } = useQuery<CustomerListItem[]>({
    queryKey: ["/api/customers", statusFilter, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ status: statusFilter });
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      const res = await fetch(`/api/customers?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load customers");
      return res.json();
    },
  });

  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      name: "", customerType: "", phone: "", email: "", website: "",
      address: "", city: "", state: "", zip: "", notes: "",
      contactFirstName: "", contactLastName: "", contactJobTitle: "",
      contactEmail: "", contactOfficePhone: "", contactMobilePhone: "", contactExtension: "",
    },
  });

  // Non-blocking duplicate company-name warning
  const companyName = form.watch("name");
  useEffect(() => {
    if (!dialogOpen || !companyName || companyName.trim().length < 3) {
      setDuplicates([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/customers/duplicate-check?name=${encodeURIComponent(companyName.trim())}`, { credentials: "include" });
        if (res.ok) setDuplicates(await res.json());
      } catch {
        // best-effort warning only
      }
    }, 400);
    return () => clearTimeout(t);
  }, [companyName, dialogOpen]);

  const createMutation = useMutation({
    mutationFn: async (data: CustomerFormData) => {
      const res = await apiRequest("POST", "/api/customers", {
        name: data.name,
        customerType: data.customerType || null,
        phone: data.phone || null,
        email: data.email || null,
        website: data.website || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        notes: data.notes || null,
      });
      const customer = await res.json();
      // Optional primary contact created alongside the company
      if (data.contactFirstName?.trim()) {
        await apiRequest("POST", `/api/customers/${customer.id}/contacts`, {
          firstName: data.contactFirstName.trim(),
          lastName: data.contactLastName?.trim() || null,
          jobTitle: data.contactJobTitle || null,
          roles: contactRoles,
          email: data.contactEmail || null,
          officePhone: data.contactOfficePhone || null,
          mobilePhone: data.contactMobilePhone || null,
          extension: data.contactExtension || null,
          isPrimary: true,
          isActive: true,
        });
      }
      return customer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setDialogOpen(false);
      form.reset();
      setContactRoles([]);
      setDuplicates([]);
      toast({ title: "Customer created successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create customer", description: err.message, variant: "destructive" });
    },
  });

  const toggleRole = (role: ContactRole) => {
    setContactRoles((prev) => prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground">Manage your customer companies and contacts</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-customer">
              <Plus className="w-4 h-4 mr-2" />
              New Customer
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Customer</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Company Information</h3>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="ABC Construction" {...field} data-testid="input-customer-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {duplicates.length > 0 && (
                  <div className="rounded-md border border-yellow-400/50 bg-yellow-50 dark:bg-yellow-950/30 p-3 text-sm" data-testid="warning-duplicate-customer">
                    <div className="flex items-center gap-2 font-medium text-yellow-800 dark:text-yellow-300">
                      <AlertTriangle className="w-4 h-4" />
                      Possible existing customer
                    </div>
                    <ul className="mt-1 space-y-1">
                      {duplicates.map((d) => (
                        <li key={d.id}>
                          <Link href={`/customers/${d.id}`} className="text-primary hover:underline">
                            {d.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <p className="text-muted-foreground mt-1">You can still create this customer if it's a different company.</p>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="customerType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-customer-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CUSTOMER_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>{CUSTOMER_TYPE_LABELS[t]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Main Phone</FormLabel>
                        <FormControl>
                          <Input type="tel" placeholder="(555) 123-4567" {...field} data-testid="input-customer-phone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>General Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="info@company.com" {...field} data-testid="input-customer-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website</FormLabel>
                        <FormControl>
                          <Input placeholder="www.company.com" {...field} data-testid="input-customer-website" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input placeholder="123 Main Street" {...field} data-testid="input-customer-address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input placeholder="Cityville" {...field} data-testid="input-customer-city" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>State</FormLabel>
                        <FormControl>
                          <Input placeholder="NJ" {...field} data-testid="input-customer-state" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="zip"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ZIP</FormLabel>
                        <FormControl>
                          <Input placeholder="12345" {...field} data-testid="input-customer-zip" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Additional notes..." {...field} data-testid="input-customer-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="pt-2 border-t">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mt-2">Primary Contact (optional)</h3>
                  <p className="text-xs text-muted-foreground mb-3">Add the first contact for this company. They'll be marked as the Primary Contact.</p>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="contactFirstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>First Name</FormLabel>
                            <FormControl>
                              <Input placeholder="John" {...field} data-testid="input-contact-first-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="contactLastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Last Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Smith" {...field} data-testid="input-contact-last-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="contactJobTitle"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Job Title</FormLabel>
                            <FormControl>
                              <Input placeholder="Senior Estimator" {...field} data-testid="input-contact-job-title" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="contactEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="john@company.com" {...field} data-testid="input-contact-email" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="contactOfficePhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Office Phone</FormLabel>
                            <FormControl>
                              <Input type="tel" {...field} data-testid="input-contact-office-phone" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="contactMobilePhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mobile Phone</FormLabel>
                            <FormControl>
                              <Input type="tel" {...field} data-testid="input-contact-mobile-phone" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="contactExtension"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Extension</FormLabel>
                            <FormControl>
                              <Input {...field} data-testid="input-contact-extension" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div>
                      <FormLabel>Role(s)</FormLabel>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {CONTACT_ROLES.map((role) => (
                          <Badge
                            key={role}
                            variant={contactRoles.includes(role) ? "default" : "outline"}
                            className="cursor-pointer select-none"
                            onClick={() => toggleRole(role)}
                            data-testid={`badge-role-${role}`}
                          >
                            {CONTACT_ROLE_LABELS[role]}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-customer">
                    {createMutation.isPending ? "Creating..." : "Create Customer"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search company, contact, email, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="input-search-customers"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center self-stretch border rounded-lg overflow-hidden" role="group" aria-label="Customer view">
          <Button
            variant={viewMode === "grid" ? "default" : "ghost"}
            size="sm"
            className="rounded-none flex-1 sm:flex-none"
            onClick={() => setViewMode("grid")}
            aria-label="Card view"
            aria-pressed={viewMode === "grid"}
            title="Card view"
            data-testid="button-view-grid"
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="sr-only">Card view</span>
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "ghost"}
            size="sm"
            className="rounded-none flex-1 sm:flex-none"
            onClick={() => setViewMode("list")}
            aria-label="List view"
            aria-pressed={viewMode === "list"}
            title="List view"
            data-testid="button-view-list"
          >
            <List className="w-4 h-4" />
            <span className="sr-only">List view</span>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-2"}>
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              {viewMode === "grid" ? (
                <>
                  <CardHeader className="pb-2">
                    <div className="h-6 bg-muted rounded w-3/4" />
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="h-4 bg-muted rounded w-1/2" />
                      <div className="h-4 bg-muted rounded w-2/3" />
                    </div>
                  </CardContent>
                </>
              ) : (
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                    <div className="space-y-2 flex-1">
                      <div className="h-5 bg-muted rounded w-2/3 sm:w-1/3" />
                      <div className="h-4 bg-muted rounded w-1/2 sm:w-1/4" />
                    </div>
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-muted rounded w-3/4" />
                      <div className="h-4 bg-muted rounded w-1/2" />
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      ) : customers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <UsersIcon className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">
              {search || statusFilter !== "active" ? "No customers found" : "No customers yet"}
            </h3>
            <p className="text-muted-foreground mb-4">
              {search ? "Try a different search or status filter" : "Add your first customer to get started"}
            </p>
            {!search && (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Customer
              </Button>
            )}
          </CardContent>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map((customer) => (
            <Link key={customer.id} href={`/customers/${customer.id}`}>
              <Card className="hover-elevate cursor-pointer h-full" data-testid={`card-customer-${customer.id}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="truncate">{customer.name}</span>
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    {customer.customerType && (
                      <Badge variant="secondary" className="text-xs">
                        {CUSTOMER_TYPE_LABELS[customer.customerType as CustomerType] || customer.customerType}
                      </Badge>
                    )}
                    {customer.status !== "active" && (
                      <Badge variant="outline" className="text-xs capitalize">{customer.status}</Badge>
                    )}
                    {customer.nameNeedsReview && (
                      <Badge variant="outline" className="text-xs text-yellow-700 dark:text-yellow-400 border-yellow-400">
                        Needs review
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {customer.primaryContact ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <Star className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="font-medium">
                          {customer.primaryContact.firstName} {customer.primaryContact.lastName || ""}
                        </span>
                        <span className="text-xs text-muted-foreground">Primary</span>
                      </div>
                      {customer.primaryContact.email && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="w-4 h-4 shrink-0" />
                          <span className="truncate">{customer.primaryContact.email}</span>
                        </div>
                      )}
                      {(customer.primaryContact.mobilePhone || customer.primaryContact.officePhone) && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="w-4 h-4 shrink-0" />
                          {customer.primaryContact.mobilePhone || customer.primaryContact.officePhone}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {customer.email && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="w-4 h-4 shrink-0" />
                          <span className="truncate">{customer.email}</span>
                        </div>
                      )}
                      {customer.phone && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="w-4 h-4 shrink-0" />
                          {customer.phone}
                        </div>
                      )}
                    </>
                  )}
                  {customer.city && customer.state && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4 shrink-0" />
                      {customer.city}, {customer.state}
                    </div>
                  )}
                  {customer.matchReason && (
                    <div className="text-xs text-primary pt-1" data-testid={`text-match-reason-${customer.id}`}>
                      Matched — {customer.matchReason}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="space-y-2" data-testid="customer-list">
          {customers.map((customer) => {
            const primaryPhone = customer.primaryContact?.mobilePhone || customer.primaryContact?.officePhone;
            const location = [customer.city, customer.state].filter(Boolean).join(", ");

            return (
              <Link key={customer.id} href={`/customers/${customer.id}`}>
                <Card className="hover-elevate cursor-pointer" data-testid={`row-customer-${customer.id}`}>
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex flex-col sm:grid sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 sm:gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                          <h3 className="font-semibold truncate">{customer.name}</h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {customer.customerType && (
                            <Badge variant="secondary" className="text-xs">
                              {CUSTOMER_TYPE_LABELS[customer.customerType as CustomerType] || customer.customerType}
                            </Badge>
                          )}
                          {customer.status !== "active" && (
                            <Badge variant="outline" className="text-xs capitalize">{customer.status}</Badge>
                          )}
                          {customer.nameNeedsReview && (
                            <Badge variant="outline" className="text-xs text-yellow-700 dark:text-yellow-400 border-yellow-400">
                              Needs review
                            </Badge>
                          )}
                        </div>
                        {customer.matchReason && (
                          <div className="text-xs text-primary mt-2" data-testid={`text-match-reason-${customer.id}`}>
                            Matched — {customer.matchReason}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 space-y-1 text-sm">
                        {customer.primaryContact ? (
                          <>
                            <div className="flex items-center gap-2 min-w-0">
                              <Star className="w-3.5 h-3.5 text-primary shrink-0" />
                              <span className="font-medium truncate">
                                {customer.primaryContact.firstName} {customer.primaryContact.lastName || ""}
                              </span>
                              <span className="text-xs text-muted-foreground shrink-0">Primary</span>
                            </div>
                            {customer.primaryContact.email && (
                              <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                                <Mail className="w-4 h-4 shrink-0" />
                                <span className="truncate">{customer.primaryContact.email}</span>
                              </div>
                            )}
                            {primaryPhone && (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Phone className="w-4 h-4 shrink-0" />
                                <span>{primaryPhone}</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">No primary contact</span>
                        )}
                      </div>

                      <div className="min-w-0 space-y-1 text-sm text-muted-foreground">
                        {location && (
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 shrink-0" />
                            <span>{location}</span>
                          </div>
                        )}
                        {customer.email && (
                          <div className="flex items-center gap-2 min-w-0">
                            <Mail className="w-4 h-4 shrink-0" />
                            <span className="truncate">{customer.email}</span>
                          </div>
                        )}
                        {customer.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 shrink-0" />
                            <span>{customer.phone}</span>
                          </div>
                        )}
                        {!location && !customer.email && !customer.phone && (
                          <span>No company contact details</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
