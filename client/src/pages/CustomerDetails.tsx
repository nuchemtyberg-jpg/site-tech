import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Phone, Mail, Building2, MapPin, Edit, Trash2, Plus, MessageSquare } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { Customer, Project, Communication } from "@shared/schema";
import { Link } from "wouter";

const communicationSchema = z.object({
  type: z.string().min(1, "Type is required"),
  subject: z.string().optional(),
  notes: z.string().min(1, "Notes are required"),
  contactDate: z.string().min(1, "Date is required"),
  followUpDate: z.string().optional(),
});

type CommunicationFormData = z.infer<typeof communicationSchema>;

export default function CustomerDetails() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [commDialogOpen, setCommDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const { toast } = useToast();

  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: ["/api/customers", id],
    queryFn: () => fetch(`/api/customers/${id}`).then((r) => r.json()),
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: communications = [] } = useQuery<Communication[]>({
    queryKey: ["/api/customers", id, "communications"],
    queryFn: () => fetch(`/api/customers/${id}/communications`).then((r) => r.json()),
  });

  const customerProjects = projects.filter((p) => p.customerId === Number(id));

  const commForm = useForm<CommunicationFormData>({
    resolver: zodResolver(communicationSchema),
    defaultValues: {
      type: "phone",
      subject: "",
      notes: "",
      contactDate: new Date().toISOString().split("T")[0],
      followUpDate: "",
    },
  });

  const createCommMutation = useMutation({
    mutationFn: async (data: CommunicationFormData) => {
      return apiRequest(`/api/customers/${id}/communications`, {
        method: "POST",
        body: JSON.stringify({
          ...data,
          contactDate: new Date(data.contactDate),
          followUpDate: data.followUpDate ? data.followUpDate : null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", id, "communications"] });
      setCommDialogOpen(false);
      commForm.reset();
      toast({ title: "Communication logged successfully" });
    },
    onError: () => {
      toast({ title: "Failed to log communication", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/customers/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      navigate("/customers");
      toast({ title: "Customer deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete customer", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-muted rounded w-48 animate-pulse" />
        <div className="h-64 bg-muted rounded animate-pulse" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Customer not found</h2>
        <Button variant="link" onClick={() => navigate("/customers")}>
          Back to Customers
        </Button>
      </div>
    );
  }

  const communicationTypes: Record<string, string> = {
    email: "Email",
    phone: "Phone Call",
    meeting: "Meeting",
    site_visit: "Site Visit",
    other: "Other",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button variant="ghost" size="icon" onClick={() => navigate("/customers")} data-testid="button-back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold tracking-tight truncate">{customer.name}</h1>
            {customer.company && <p className="text-muted-foreground truncate">{customer.company}</p>}
          </div>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setDeleteConfirmOpen(true)}
          data-testid="button-delete-customer"
          className="self-start sm:self-auto"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {customer.email && (
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-muted-foreground" />
                <a href={`mailto:${customer.email}`} className="text-primary hover:underline">
                  {customer.email}
                </a>
              </div>
            )}
            {customer.phone && (
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-muted-foreground" />
                <a href={`tel:${customer.phone}`} className="text-primary hover:underline">
                  {customer.phone}
                </a>
              </div>
            )}
            {customer.company && (
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-muted-foreground" />
                <span>{customer.company}</span>
              </div>
            )}
            {(customer.address || customer.city) && (
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  {customer.address && <div>{customer.address}</div>}
                  {customer.city && (
                    <div>
                      {customer.city}
                      {customer.state && `, ${customer.state}`}
                      {customer.zip && ` ${customer.zip}`}
                    </div>
                  )}
                </div>
              </div>
            )}
            {customer.notes && (
              <div className="pt-4 border-t">
                <h4 className="text-sm font-medium mb-2">Notes</h4>
                <p className="text-sm text-muted-foreground">{customer.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <Tabs defaultValue="projects">
            <TabsList>
              <TabsTrigger value="projects">Projects ({customerProjects.length})</TabsTrigger>
              <TabsTrigger value="communications">Communications ({communications.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="projects" className="mt-4 space-y-4">
              {customerProjects.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-8">
                    <p className="text-muted-foreground mb-4">No projects linked to this customer</p>
                    <Link href="/projects">
                      <Button variant="outline">
                        <Plus className="w-4 h-4 mr-2" />
                        Create Project
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ) : (
                customerProjects.map((project) => (
                  <Link key={project.id} href={`/projects/${project.id}`}>
                    <Card className="hover-elevate cursor-pointer">
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color }} />
                          <div>
                            <h4 className="font-medium">{project.name}</h4>
                            {project.location && (
                              <p className="text-sm text-muted-foreground">{project.location}</p>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline">{project.status}</Badge>
                      </CardContent>
                    </Card>
                  </Link>
                ))
              )}
            </TabsContent>

            <TabsContent value="communications" className="mt-4 space-y-4">
              <div className="flex justify-end">
                <Dialog open={commDialogOpen} onOpenChange={setCommDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-log-communication">
                      <Plus className="w-4 h-4 mr-2" />
                      Log Communication
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Log Communication</DialogTitle>
                    </DialogHeader>
                    <Form {...commForm}>
                      <form onSubmit={commForm.handleSubmit((data) => createCommMutation.mutate(data))} className="space-y-4">
                        <FormField
                          control={commForm.control}
                          name="type"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Type</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-comm-type">
                                    <SelectValue placeholder="Select type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="phone">Phone Call</SelectItem>
                                  <SelectItem value="email">Email</SelectItem>
                                  <SelectItem value="meeting">Meeting</SelectItem>
                                  <SelectItem value="site_visit">Site Visit</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={commForm.control}
                          name="contactDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Date</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} data-testid="input-comm-date" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={commForm.control}
                          name="subject"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Subject</FormLabel>
                              <FormControl>
                                <Input placeholder="Brief subject..." {...field} data-testid="input-comm-subject" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={commForm.control}
                          name="notes"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Notes</FormLabel>
                              <FormControl>
                                <Textarea placeholder="Details of communication..." {...field} data-testid="input-comm-notes" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={commForm.control}
                          name="followUpDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Follow-up Date (optional)</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} data-testid="input-comm-followup" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" onClick={() => setCommDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button type="submit" disabled={createCommMutation.isPending} data-testid="button-save-communication">
                            {createCommMutation.isPending ? "Saving..." : "Save"}
                          </Button>
                        </div>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </div>

              {communications.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-8">
                    <MessageSquare className="w-12 h-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No communications logged yet</p>
                  </CardContent>
                </Card>
              ) : (
                communications.map((comm) => (
                  <Card key={comm.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{communicationTypes[comm.type] || comm.type}</Badge>
                            <span className="text-sm text-muted-foreground">
                              {comm.contactDate && format(new Date(comm.contactDate), "MMM d, yyyy")}
                            </span>
                          </div>
                          {comm.subject && <h4 className="font-medium">{comm.subject}</h4>}
                          <p className="text-sm text-muted-foreground">{comm.notes}</p>
                          {comm.followUpDate && (
                            <p className="text-xs text-primary">
                              Follow-up: {format(new Date(comm.followUpDate), "MMM d, yyyy")}
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Delete Customer Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="bg-white dark:bg-zinc-900 text-black dark:text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this customer? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-customer">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deleteMutation.mutate();
                setDeleteConfirmOpen(false);
              }}
              data-testid="button-confirm-delete-customer"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
