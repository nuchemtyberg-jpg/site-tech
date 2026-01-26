import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Search, MapPin, Calendar, ArrowRight, DollarSign, UserPlus, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Project, Customer } from "@shared/schema";

const projectFormSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  streetAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  customerId: z.number().optional().nullable(),
  status: z.string().default("new"),
  notes: z.string().optional(),
  color: z.string().default("#f97316"),
});

type ProjectFormData = z.infer<typeof projectFormSchema>;

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

const PROJECT_STATUSES = [
  { value: "new", label: "New" },
  { value: "bidding", label: "Bidding" },
  { value: "takeoff_done", label: "Takeoff Done" },
  { value: "proposal_sent", label: "Proposal Sent" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "bid_lost", label: "Bid Lost" },
  { value: "archive", label: "Archive" },
];

export default function Projects() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [nextProjectNumber, setNextProjectNumber] = useState<string>("");
  const { toast } = useToast();

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  // Fetch next project number when dialog opens
  useEffect(() => {
    if (dialogOpen) {
      fetch("/api/projects/next-number")
        .then(res => res.json())
        .then(data => setNextProjectNumber(data.projectNumber))
        .catch(() => setNextProjectNumber("S-1000"));
    }
  }, [dialogOpen]);

  const form = useForm<ProjectFormData>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: "",
      streetAddress: "",
      city: "",
      state: "",
      customerId: null,
      status: "new",
      notes: "",
      color: "#f97316",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ProjectFormData) => {
      // Combine address for backward compatibility with location field
      const location = [data.streetAddress, data.city, data.state].filter(Boolean).join(", ");
      return apiRequest("POST", "/api/projects", {
        ...data,
        location: location || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setDialogOpen(false);
      form.reset();
      toast({ title: "Project created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create project", variant: "destructive" });
    },
  });

  // Filter customers by search
  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.company && c.company.toLowerCase().includes(customerSearch.toLowerCase()))
  );

  const filteredProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.location?.toLowerCase().includes(search.toLowerCase()) ||
      p.projectNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "new":
        return "bg-blue-500/10 text-blue-500";
      case "bidding":
        return "bg-indigo-500/10 text-indigo-500";
      case "takeoff_done":
        return "bg-purple-500/10 text-purple-500";
      case "proposal_sent":
        return "bg-cyan-500/10 text-cyan-500";
      case "active":
        return "bg-orange-500/10 text-orange-500";
      case "completed":
        return "bg-green-500/10 text-green-500";
      case "bid_lost":
        return "bg-red-500/10 text-red-500";
      case "archive":
        return "bg-gray-500/10 text-gray-500";
      default:
        return "bg-muted text-muted-foreground";
    }
  };
  
  const getStatusLabel = (status: string) => {
    const statusObj = PROJECT_STATUSES.find(s => s.value === status);
    return statusObj?.label || status.replace("_", " ");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage your sitework projects</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-project">
              <Plus className="mr-2 h-4 w-4" /> New Project
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
                {/* Project Number (auto-generated, read-only) */}
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Hash className="w-4 h-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Project Number:</span>
                  <span className="font-mono font-bold text-primary">{nextProjectNumber || "Loading..."}</span>
                </div>

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Main Street Subdivision" {...field} data-testid="input-project-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Address Fields */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-muted-foreground">Project Address</h4>
                  <FormField
                    control={form.control}
                    name="streetAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Street Address</FormLabel>
                        <FormControl>
                          <Input placeholder="123 Main Street" {...field} data-testid="input-project-street" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input placeholder="City" {...field} data-testid="input-project-city" />
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
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-project-state">
                                <SelectValue placeholder="Select state" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {US_STATES.map((state) => (
                                <SelectItem key={state} value={state}>
                                  {state}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                {/* Customer Selection */}
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Customer</FormLabel>
                      <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn(
                                "w-full justify-between",
                                !field.value && "text-muted-foreground"
                              )}
                              data-testid="select-project-customer"
                            >
                              {field.value
                                ? customers.find((c) => c.id === field.value)?.name || "Select customer"
                                : "Select customer"}
                              <UserPlus className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" align="start">
                          <Command>
                            <CommandInput 
                              placeholder="Search customers..." 
                              value={customerSearch}
                              onValueChange={setCustomerSearch}
                            />
                            <CommandList>
                              <CommandEmpty>
                                <div className="p-2 text-center">
                                  <p className="text-sm text-muted-foreground mb-2">No customer found.</p>
                                  <Link href="/customers">
                                    <Button size="sm" variant="outline">
                                      <UserPlus className="w-4 h-4 mr-2" />
                                      Add New Customer
                                    </Button>
                                  </Link>
                                </div>
                              </CommandEmpty>
                              <CommandGroup>
                                {filteredCustomers.map((customer) => (
                                  <CommandItem
                                    key={customer.id}
                                    value={customer.name}
                                    onSelect={() => {
                                      field.onChange(customer.id);
                                      setCustomerPopoverOpen(false);
                                    }}
                                  >
                                    <span>{customer.name}</span>
                                    {customer.company && (
                                      <span className="ml-2 text-muted-foreground text-sm">
                                        ({customer.company})
                                      </span>
                                    )}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Status */}
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-project-status">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PROJECT_STATUSES.map((status) => (
                            <SelectItem key={status.value} value={status.value}>
                              {status.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Notes */}
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Additional project notes..." 
                          {...field} 
                          data-testid="input-project-notes" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-project">
                    {createMutation.isPending ? "Creating..." : "Create Project"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2 bg-card p-2 rounded-lg border border-border max-w-md">
        <Search className="w-5 h-5 text-muted-foreground ml-2" />
        <Input
          placeholder="Search projects..."
          className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="input-search-projects"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 rounded-xl bg-card animate-pulse border border-border" />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-20 bg-card/50 rounded-xl border border-dashed border-border">
          <MapPin className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-xl font-medium">No projects found</h3>
          <p className="text-muted-foreground mt-2">Create your first project to get started.</p>
          <Button className="mt-4" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => {
            const customer = customers.find((c) => c.id === project.customerId);
            return (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card 
                  className="hover-elevate cursor-pointer h-full overflow-hidden" 
                  data-testid={`card-project-${project.id}`}
                >
                  <div className="h-2 w-full" style={{ backgroundColor: project.color }} />
                  <CardContent className="p-6 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`inline-block px-2 py-1 rounded text-xs font-semibold tracking-wide uppercase ${getStatusStyle(project.status)}`}>
                            {getStatusLabel(project.status)}
                          </span>
                          {project.projectNumber && (
                            <span className="text-xs font-mono text-muted-foreground">
                              {project.projectNumber}
                            </span>
                          )}
                        </div>
                        <h3 className="text-xl font-bold">{project.name}</h3>
                      </div>
                    </div>

                    {project.description && (
                      <p className="text-muted-foreground text-sm line-clamp-2 mb-4 flex-1">
                        {project.description}
                      </p>
                    )}

                    {customer && (
                      <p className="text-sm text-primary mb-2">
                        {customer.name} {customer.company ? `- ${customer.company}` : ""}
                      </p>
                    )}

                    <div className="space-y-2 pt-4 border-t border-border">
                      {project.location && (
                        <div className="flex items-center text-sm text-muted-foreground">
                          <MapPin className="w-4 h-4 mr-2 text-primary" />
                          {project.location}
                        </div>
                      )}
                      {project.startDate && (
                        <div className="flex items-center text-sm text-muted-foreground">
                          <Calendar className="w-4 h-4 mr-2 text-primary" />
                          {format(new Date(project.startDate), "MMM d, yyyy")}
                          {project.endDate && ` - ${format(new Date(project.endDate), "MMM d, yyyy")}`}
                        </div>
                      )}
                      {project.estimatedValue && (
                        <div className="flex items-center text-sm text-muted-foreground">
                          <DollarSign className="w-4 h-4 mr-2 text-primary" />
                          ${project.estimatedValue.toLocaleString()}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-end text-sm font-medium text-primary">
                      View Details <ArrowRight className="w-4 h-4 ml-1" />
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
