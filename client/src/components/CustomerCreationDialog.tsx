import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Loader2 } from "lucide-react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { extractApiError } from "@/hooks/use-todos";
import { apiRequest } from "@/lib/queryClient";
import {
  CONTACT_ROLES, CONTACT_ROLE_LABELS, CUSTOMER_TYPES, CUSTOMER_TYPE_LABELS,
  type ContactRole, type Customer,
} from "@shared/schema";

export const customerCreationSchema = z.object({
  name: z.string().trim().min(1, "Company name is required"),
  customerType: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email("Enter a valid company email").optional().or(z.literal("")),
  website: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  notes: z.string().optional(),
  contactFirstName: z.string().optional(),
  contactLastName: z.string().optional(),
  contactJobTitle: z.string().optional(),
  contactEmail: z.string().email("Enter a valid contact email").optional().or(z.literal("")),
  contactOfficePhone: z.string().optional(),
  contactMobilePhone: z.string().optional(),
  contactExtension: z.string().optional(),
});

export type CustomerCreationData = z.infer<typeof customerCreationSchema>;
type Duplicate = Pick<Customer, "id" | "name" | "status">;

const defaults: CustomerCreationData = {
  name: "", customerType: "", phone: "", email: "", website: "", address: "", city: "", state: "", zip: "", notes: "",
  contactFirstName: "", contactLastName: "", contactJobTitle: "", contactEmail: "",
  contactOfficePhone: "", contactMobilePhone: "", contactExtension: "",
};

export function CustomerCreationDialog({ open, onOpenChange, onCreated, onSelectExisting }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (customer: Customer) => void;
  onSelectExisting?: (customer: Duplicate) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [contactRoles, setContactRoles] = useState<ContactRole[]>([]);
  const [duplicates, setDuplicates] = useState<Duplicate[]>([]);
  const sessionRef = useRef(0);
  const wasOpenRef = useRef(open);
  const createInFlightRef = useRef(false);
  const form = useForm<CustomerCreationData>({ resolver: zodResolver(customerCreationSchema), defaultValues: defaults });
  const companyName = form.watch("name");

  const reset = () => {
    form.reset(defaults);
    setContactRoles([]);
    setDuplicates([]);
  };

  useEffect(() => {
    if (wasOpenRef.current && !open) {
      sessionRef.current += 1;
      reset();
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open || companyName.trim().length < 3) {
      setDuplicates([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/customers/duplicate-check?name=${encodeURIComponent(companyName.trim())}`, {
          credentials: "include",
          signal: controller.signal,
        });
        if (response.ok) setDuplicates(await response.json());
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setDuplicates([]);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [companyName, open]);

  const create = useMutation({
    mutationFn: async ({ data, session }: { data: CustomerCreationData; session: number }) => {
      const response = await apiRequest("POST", "/api/customers", {
        name: data.name.trim(),
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
      const customer = await response.json() as Customer;
      if (data.contactFirstName?.trim()) {
        try {
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
        } catch (error) {
          return { customer, contactError: error, session };
        }
      }
      return { customer, contactError: null, session };
    },
    onSuccess: ({ customer, contactError, session }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      if (session !== sessionRef.current) return;
      onCreated?.(customer);
      onOpenChange(false);
      if (contactError) {
        toast({
          title: "Customer created, but contact was not",
          description: extractApiError(contactError, "Open the customer and add the primary contact again."),
          variant: "destructive",
        });
      } else {
        toast({ title: "Customer created successfully" });
      }
    },
    onError: (error, variables) => {
      if (variables.session !== sessionRef.current) return;
      toast({
        title: "Couldn't create customer",
        description: extractApiError(error, "Check the company details and try again."),
        variant: "destructive",
      });
    },
    onSettled: () => {
      createInFlightRef.current = false;
    },
  });

  const selectExisting = (customer: Duplicate) => {
    if (createInFlightRef.current) return;
    onSelectExisting?.(customer);
    onOpenChange(false);
  };
  const submit = (data: CustomerCreationData) => {
    if (createInFlightRef.current) return;
    createInFlightRef.current = true;
    create.mutate({ data, session: sessionRef.current });
  };
  const toggleRole = (role: ContactRole) => setContactRoles(current =>
    current.includes(role) ? current.filter(item => item !== role) : [...current, role]);

  return (
    <Dialog open={open} onOpenChange={nextOpen => {
      if (!nextOpen && create.isPending) return;
      onOpenChange(nextOpen);
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-create-customer">
        <DialogHeader>
          <DialogTitle>Add New Customer</DialogTitle>
          <DialogDescription>Enter company information and, if useful, its primary contact.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Company Information</h3>
            <FormField control={form.control} name="name" render={({ field }) => <FormItem>
              <FormLabel>Company Name *</FormLabel><FormControl><Input placeholder="ABC Construction" {...field} data-testid="input-customer-name" /></FormControl><FormMessage />
            </FormItem>} />
            {duplicates.length > 0 && <div className="rounded-md border border-yellow-400/50 bg-yellow-50 dark:bg-yellow-950/30 p-3 text-sm" data-testid="warning-duplicate-customer">
              <div className="flex items-center gap-2 font-medium text-yellow-800 dark:text-yellow-300"><AlertTriangle className="w-4 h-4" />Possible existing customer</div>
              <div className="mt-2 flex flex-wrap gap-2">{duplicates.map(customer => {
                if (onSelectExisting) {
                  return customer.status === "active"
                    ? <Button key={customer.id} type="button" variant="outline" size="sm" disabled={create.isPending} onClick={() => selectExisting(customer)} data-testid={`button-select-existing-customer-${customer.id}`}>Use {customer.name}</Button>
                    : <span key={customer.id} className="px-1 py-2 text-muted-foreground">{customer.name} ({customer.status})</span>;
                }
                return <a key={customer.id} href={`/customers/${customer.id}`} className="text-primary hover:underline px-1 py-2">{customer.name}{customer.status !== "active" ? ` (${customer.status})` : ""}</a>;
              })}</div>
              <p className="text-muted-foreground mt-1">You can still create this customer if it's a different company.</p>
            </div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="customerType" render={({ field }) => <FormItem><FormLabel>Customer Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}><FormControl><SelectTrigger data-testid="select-customer-type"><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                  <SelectContent>{CUSTOMER_TYPES.map(type => <SelectItem key={type} value={type}>{CUSTOMER_TYPE_LABELS[type]}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>} />
              <FormField control={form.control} name="phone" render={({ field }) => <FormItem><FormLabel>Main Phone</FormLabel><FormControl><Input type="tel" {...field} data-testid="input-customer-phone" /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="email" render={({ field }) => <FormItem><FormLabel>General Email</FormLabel><FormControl><Input type="email" {...field} data-testid="input-customer-email" /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="website" render={({ field }) => <FormItem><FormLabel>Website</FormLabel><FormControl><Input {...field} data-testid="input-customer-website" /></FormControl><FormMessage /></FormItem>} />
            </div>
            <FormField control={form.control} name="address" render={({ field }) => <FormItem><FormLabel>Address</FormLabel><FormControl><Input {...field} data-testid="input-customer-address" /></FormControl><FormMessage /></FormItem>} />
            <div className="grid grid-cols-3 gap-4">
              {(["city", "state", "zip"] as const).map(name => <FormField key={name} control={form.control} name={name} render={({ field }) => <FormItem><FormLabel>{name === "zip" ? "ZIP" : name[0].toUpperCase() + name.slice(1)}</FormLabel><FormControl><Input {...field} data-testid={`input-customer-${name}`} /></FormControl><FormMessage /></FormItem>} />)}
            </div>
            <FormField control={form.control} name="notes" render={({ field }) => <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea {...field} data-testid="input-customer-notes" /></FormControl><FormMessage /></FormItem>} />
            <div className="pt-3 border-t space-y-4">
              <div><h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Primary Contact (optional)</h3><p className="text-xs text-muted-foreground">A first name starts primary-contact creation.</p></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="contactFirstName" render={({ field }) => <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} data-testid="input-contact-first-name" /></FormControl><FormMessage /></FormItem>} />
                <FormField control={form.control} name="contactLastName" render={({ field }) => <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} data-testid="input-contact-last-name" /></FormControl><FormMessage /></FormItem>} />
                <FormField control={form.control} name="contactJobTitle" render={({ field }) => <FormItem><FormLabel>Job Title</FormLabel><FormControl><Input {...field} data-testid="input-contact-job-title" /></FormControl><FormMessage /></FormItem>} />
                <FormField control={form.control} name="contactEmail" render={({ field }) => <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} data-testid="input-contact-email" /></FormControl><FormMessage /></FormItem>} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="contactOfficePhone" render={({ field }) => <FormItem><FormLabel>Office Phone</FormLabel><FormControl><Input type="tel" {...field} data-testid="input-contact-office-phone" /></FormControl><FormMessage /></FormItem>} />
                <FormField control={form.control} name="contactMobilePhone" render={({ field }) => <FormItem><FormLabel>Mobile Phone</FormLabel><FormControl><Input type="tel" {...field} data-testid="input-contact-mobile-phone" /></FormControl><FormMessage /></FormItem>} />
                <FormField control={form.control} name="contactExtension" render={({ field }) => <FormItem><FormLabel>Extension</FormLabel><FormControl><Input {...field} data-testid="input-contact-extension" /></FormControl><FormMessage /></FormItem>} />
              </div>
              <div><FormLabel>Role(s)</FormLabel><div className="flex flex-wrap gap-2 mt-2">{CONTACT_ROLES.map(role =>
                <Badge key={role} variant={contactRoles.includes(role) ? "default" : "outline"} className="cursor-pointer select-none" onClick={() => toggleRole(role)} data-testid={`badge-role-${role}`}>{CONTACT_ROLE_LABELS[role]}</Badge>
              )}</div></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={create.isPending} onClick={() => onOpenChange(false)} data-testid="button-cancel-customer">Cancel</Button>
              <Button type="submit" disabled={create.isPending} data-testid="button-save-customer">{create.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}Create Customer</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}