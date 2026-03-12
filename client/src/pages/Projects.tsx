import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Plus, Search, MapPin, Calendar, ArrowRight, UserPlus, Hash, LayoutGrid, List, ArrowUpDown, Filter, X, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuCheckboxItem
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Project, Customer, InsertCustomer } from "@shared/schema";

const projectFormSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  streetAddress: z.string().min(1, "Street address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zip: z.string().min(1, "Zip code is required"),
  customerId: z.number({ required_error: "Customer is required" }),
  status: z.string().min(1, "Status is required"),
  notes: z.string().optional(),
});

type ProjectFormData = z.infer<typeof projectFormSchema>;

const customerFormSchema = z.object({
  name: z.string().min(1, "Customer name is required"),
  company: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
});

type CustomerFormData = z.infer<typeof customerFormSchema>;

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

const PROJECT_STATUSES = [
  { value: "new", label: "New", color: "#3b82f6" },
  { value: "bidding", label: "Bidding", color: "#6366f1" },
  { value: "takeoff_done", label: "Takeoff Done", color: "#8b5cf6" },
  { value: "takeoff_reviewed", label: "Takeoff Reviewed", color: "#a855f7" },
  { value: "proposal_sent", label: "Proposal Sent", color: "#06b6d4" },
  { value: "active", label: "Active", color: "#f97316" },
  { value: "completed", label: "Completed", color: "#22c55e" },
  { value: "bid_lost", label: "Bid Lost", color: "#ef4444" },
  { value: "archive", label: "Archive", color: "#6b7280" },
];

type SortOption = "name" | "date" | "status";

export default function Projects() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [nextProjectNumber, setNextProjectNumber] = useState<string>("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [sortBy, setSortBy] = useState<SortOption>("date");
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterCustomer, setFilterCustomer] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

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
      zip: "",
      customerId: undefined,
      status: "new",
      notes: "",
    },
  });

  const customerForm = useForm<CustomerFormData>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      name: "",
      company: "",
      email: "",
      phone: "",
    },
  });

  const getStatusColor = (status: string) => {
    const statusObj = PROJECT_STATUSES.find(s => s.value === status);
    return statusObj?.color || "#f97316";
  };

  const createMutation = useMutation({
    mutationFn: async (data: ProjectFormData) => {
      const location = [data.streetAddress, data.city, data.state, data.zip].filter(Boolean).join(", ");
      const color = getStatusColor(data.status);
      return apiRequest("POST", "/api/projects", {
        ...data,
        location: location || null,
        color,
      });
    },
    onSuccess: async (response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setDialogOpen(false);
      form.reset();
      toast({ title: "Project created successfully" });
      const newProject = await response.json();
      navigate(`/projects/${newProject.id}`);
    },
    onError: () => {
      toast({ title: "Failed to create project", variant: "destructive" });
    },
  });

  const createCustomerMutation = useMutation({
    mutationFn: async (data: CustomerFormData) => {
      return apiRequest("POST", "/api/customers", data);
    },
    onSuccess: async (response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      const newCustomer = await response.json();
      form.setValue("customerId", newCustomer.id);
      setCustomerDialogOpen(false);
      customerForm.reset();
      toast({ title: "Customer created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create customer", variant: "destructive" });
    },
  });

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.company && c.company.toLowerCase().includes(customerSearch.toLowerCase()))
  );

  let filteredProjects = projects.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.location?.toLowerCase().includes(search.toLowerCase()) ||
      p.projectNumber?.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = filterStatus.length === 0 || filterStatus.includes(p.status);
    const matchesCustomer = filterCustomer === null || p.customerId === filterCustomer;
    
    return matchesSearch && matchesStatus && matchesCustomer;
  });

  const statusOrder = PROJECT_STATUSES.map(s => s.value);
  filteredProjects = [...filteredProjects].sort((a, b) => {
    switch (sortBy) {
      case "name":
        return a.name.localeCompare(b.name);
      case "date":
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      case "status":
        return statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
      default:
        return 0;
    }
  });

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "new":
        return "bg-blue-500/10 text-blue-500";
      case "bidding":
        return "bg-indigo-500/10 text-indigo-500";
      case "takeoff_done":
        return "bg-purple-500/10 text-purple-500";
      case "takeoff_reviewed":
        return "bg-violet-500/10 text-violet-500";
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

  const hasActiveFilters = filterStatus.length > 0 || filterCustomer !== null;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Projects</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">Manage your sitework projects</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-project">
              <Plus className="mr-2 h-4 w-4" /> New Project
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
              <DialogDescription>Fill in the project details below. Fields marked with * are required.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
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
                        <Input placeholder="e.g. Main Street Subdivision" {...field} data-testid="input-project-name" className="bg-white dark:bg-zinc-900 text-black dark:text-white" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-muted-foreground">Project Address *</h4>
                  <FormItem>
                    <FormLabel>Search Address</FormLabel>
                    <AddressAutocomplete
                      onAddressSelect={(address) => {
                        form.setValue("streetAddress", address.streetAddress);
                        form.setValue("city", address.city);
                        if (address.state) {
                          form.setValue("state", address.state);
                        }
                        if (address.zipCode) {
                          form.setValue("zip", address.zipCode);
                        }
                      }}
                      placeholder="Start typing an address..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Type to search, or fill in the fields below manually
                    </p>
                  </FormItem>
                  <FormField
                    control={form.control}
                    name="streetAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Street Address *</FormLabel>
                        <FormControl>
                          <Input placeholder="123 Main Street" {...field} data-testid="input-project-street" className="bg-white dark:bg-zinc-900 text-black dark:text-white" />
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
                          <FormLabel>City *</FormLabel>
                          <FormControl>
                            <Input placeholder="City" {...field} data-testid="input-project-city" className="bg-white dark:bg-zinc-900 text-black dark:text-white" />
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
                          <FormLabel>State *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-project-state" className="bg-white dark:bg-zinc-900 text-black dark:text-white">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-white dark:bg-zinc-900 text-black dark:text-white">
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
                    <FormField
                      control={form.control}
                      name="zip"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Zip Code *</FormLabel>
                          <FormControl>
                            <Input placeholder="12345" {...field} data-testid="input-project-zip" className="bg-white dark:bg-zinc-900 text-black dark:text-white" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Customer *</FormLabel>
                      <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn(
                                "w-full justify-between bg-white dark:bg-zinc-900",
                                field.value ? "text-black dark:text-white" : "text-muted-foreground"
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
                        <PopoverContent className="w-full p-0 bg-white dark:bg-zinc-900 text-black dark:text-white" align="start">
                          <Command className="bg-white dark:bg-zinc-900 text-black dark:text-white">
                            <CommandInput 
                              placeholder="Search customers..." 
                              value={customerSearch}
                              onValueChange={setCustomerSearch}
                              className="text-black dark:text-white"
                            />
                            <CommandList>
                              <CommandEmpty>
                                <div className="p-2 text-center">
                                  <p className="text-sm text-muted-foreground mb-2">No customer found.</p>
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setCustomerPopoverOpen(false);
                                      setCustomerDialogOpen(true);
                                    }}
                                  >
                                    <UserPlus className="w-4 h-4 mr-2" />
                                    Add New Customer
                                  </Button>
                                </div>
                              </CommandEmpty>
                              <CommandGroup>
                                <CommandItem
                                  onSelect={() => {
                                    setCustomerPopoverOpen(false);
                                    setCustomerDialogOpen(true);
                                  }}
                                  className="text-black dark:text-white"
                                >
                                  <UserPlus className="w-4 h-4 mr-2" />
                                  Add New Customer
                                </CommandItem>
                                {filteredCustomers.map((customer) => (
                                  <CommandItem
                                    key={customer.id}
                                    value={customer.name}
                                    onSelect={() => {
                                      field.onChange(customer.id);
                                      setCustomerPopoverOpen(false);
                                    }}
                                    className="text-black dark:text-white"
                                  >
                                    <span className="text-black dark:text-white">{customer.name}</span>
                                    {customer.company && (
                                      <span className="ml-2 text-gray-600 dark:text-gray-400 text-sm">
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

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-project-status" className="bg-white dark:bg-zinc-900 text-black dark:text-white">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-white dark:bg-zinc-900 text-black dark:text-white">
                          {PROJECT_STATUSES.map((status) => (
                            <SelectItem key={status.value} value={status.value}>
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: status.color }}
                                />
                                {status.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                          className="bg-white dark:bg-zinc-900 text-black dark:text-white"
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

        <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Customer</DialogTitle>
              <DialogDescription>Create a new customer to assign to this project.</DialogDescription>
            </DialogHeader>
            <Form {...customerForm}>
              <form onSubmit={customerForm.handleSubmit((data) => createCustomerMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={customerForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="John Smith" {...field} data-testid="input-customer-name" className="bg-white dark:bg-zinc-900 text-black dark:text-white" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={customerForm.control}
                  name="company"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company</FormLabel>
                      <FormControl>
                        <Input placeholder="ABC Construction" {...field} data-testid="input-customer-company" className="bg-white dark:bg-zinc-900 text-black dark:text-white" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={customerForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="john@example.com" {...field} data-testid="input-customer-email" className="bg-white dark:bg-zinc-900 text-black dark:text-white" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={customerForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input type="tel" placeholder="(555) 123-4567" {...field} data-testid="input-customer-phone" className="bg-white dark:bg-zinc-900 text-black dark:text-white" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setCustomerDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createCustomerMutation.isPending} data-testid="button-save-customer">
                    {createCustomerMutation.isPending ? "Creating..." : "Create Customer"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="flex items-center gap-2 bg-card p-2 rounded-lg border border-border flex-1 w-full sm:max-w-md">
          <Search className="w-5 h-5 text-muted-foreground ml-2 flex-shrink-0" />
          <Input
            placeholder="Search projects..."
            className="border-0 bg-white dark:bg-zinc-900 text-black dark:text-white focus-visible:ring-0 focus-visible:ring-offset-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-projects"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-sort">
                <ArrowUpDown className="w-4 h-4 mr-1 md:mr-2" />
                <span className="hidden xs:inline">Sort</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white dark:bg-zinc-900 text-black dark:text-white">
              <DropdownMenuItem onClick={() => setSortBy("name")} className={sortBy === "name" ? "bg-accent" : ""}>
                Name A-Z
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("date")} className={sortBy === "date" ? "bg-accent" : ""}>
                Date Created
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("status")} className={sortBy === "status" ? "bg-accent" : ""}>
                Status Order
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className={hasActiveFilters ? "border-primary" : ""} data-testid="button-filter">
                <Filter className="w-4 h-4 mr-2" />
                Filter
                {hasActiveFilters && <span className="ml-1 text-xs bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center">{filterStatus.length + (filterCustomer ? 1 : 0)}</span>}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-zinc-900 text-black dark:text-white">
              {hasActiveFilters && (
                <>
                  <DropdownMenuItem 
                    onClick={() => { setFilterStatus([]); setFilterCustomer(null); }}
                    className="text-destructive"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Clear All Filters
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <div className="px-2 py-1.5 text-sm font-semibold">Status</div>
              {PROJECT_STATUSES.map((status) => (
                <DropdownMenuCheckboxItem
                  key={status.value}
                  checked={filterStatus.includes(status.value)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setFilterStatus([...filterStatus, status.value]);
                    } else {
                      setFilterStatus(filterStatus.filter(s => s !== status.value));
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: status.color }} />
                    {status.label}
                  </div>
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-sm font-semibold">Customer</div>
              <DropdownMenuCheckboxItem
                checked={filterCustomer === null}
                onCheckedChange={() => setFilterCustomer(null)}
              >
                All Customers
              </DropdownMenuCheckboxItem>
              {customers.map((customer) => (
                <DropdownMenuCheckboxItem
                  key={customer.id}
                  checked={filterCustomer === customer.id}
                  onCheckedChange={(checked) => {
                    setFilterCustomer(checked ? customer.id : null);
                  }}
                >
                  {customer.name}
                </DropdownMenuCheckboxItem>
              ))}
              {hasActiveFilters && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => {
                      setFilterStatus([]);
                      setFilterCustomer(null);
                    }}
                    className="text-destructive"
                  >
                    <X className="w-4 h-4 mr-2" />
                    Clear Filters
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center border rounded-lg overflow-hidden">
            <Button
              variant={viewMode === "grid" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode("grid")}
              data-testid="button-view-grid"
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="sm"
              className="rounded-none"
              onClick={() => setViewMode("list")}
              data-testid="button-view-list"
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4" : "space-y-2"}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={viewMode === "grid" ? "h-36 md:h-40 rounded-lg bg-card animate-pulse border border-border" : "h-16 rounded-lg bg-card animate-pulse border border-border"} />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-12 md:py-20 bg-card/50 rounded-xl border border-dashed border-border">
          <MapPin className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg md:text-xl font-medium">No projects found</h3>
          <p className="text-sm md:text-base text-muted-foreground mt-2 px-4">
            {hasActiveFilters ? "Try adjusting your filters." : "Create your first project to get started."}
          </p>
          {hasActiveFilters ? (
            <Button className="mt-4" variant="outline" onClick={() => { setFilterStatus([]); setFilterCustomer(null); }}>
              <X className="w-4 h-4 mr-2" />
              Clear Filters
            </Button>
          ) : (
            <Button className="mt-4" onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
          {filteredProjects.map((project) => {
            const customer = customers.find((c) => c.id === project.customerId);
            const statusColor = getStatusColor(project.status);
            return (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card 
                  className="hover-elevate cursor-pointer h-full overflow-hidden shadow-sm" 
                  data-testid={`card-project-${project.id}`}
                >
                  <div className="h-1.5 w-full" style={{ backgroundColor: statusColor }} />
                  <CardContent className="p-3 md:p-4 flex flex-col h-full">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${getStatusStyle(project.status)}`}>
                        {getStatusLabel(project.status)}
                      </span>
                      {project.projectNumber && (
                        <span className="text-xs font-mono text-muted-foreground">
                          {project.projectNumber}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold line-clamp-1">{project.name}</h3>

                    {customer && (
                      <p className="text-xs text-primary mt-1 line-clamp-1">
                        {customer.name}
                      </p>
                    )}

                    {project.location && (
                      <div className="flex items-center text-xs text-muted-foreground mt-2">
                        <MapPin className="w-3 h-3 mr-1 text-primary shrink-0" />
                        <span 
                          role="button"
                          tabIndex={0}
                          className="line-clamp-1 text-primary hover:underline cursor-pointer"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.location || '')}`, '_blank');
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.location || '')}`, '_blank');
                            }
                          }}
                          data-testid={`link-project-address-${project.id}`}
                        >
                          {project.location}
                        </span>
                      </div>
                    )}

                    <div className="mt-auto pt-2 flex items-center justify-between text-xs">
                      {project.createdAt && (
                        <span className="text-muted-foreground">
                          {format(new Date(project.createdAt), "MMM d, yyyy")}
                        </span>
                      )}
                      <span className="text-primary font-medium flex items-center">
                        View <ArrowRight className="w-3 h-3 ml-1" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredProjects.map((project) => {
            const customer = customers.find((c) => c.id === project.customerId);
            const statusColor = getStatusColor(project.status);
            return (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card 
                  className="hover-elevate cursor-pointer overflow-hidden" 
                  data-testid={`card-project-${project.id}`}
                >
                  <div className="flex">
                    <div className="w-1.5 self-stretch shrink-0" style={{ backgroundColor: statusColor }} />
                    <CardContent className="p-3 flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${getStatusStyle(project.status)}`}>
                              {getStatusLabel(project.status)}
                            </span>
                            {project.projectNumber && (
                              <span className="text-xs font-mono text-muted-foreground shrink-0">
                                {project.projectNumber}
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-bold truncate">{project.name}</h3>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-1 text-xs text-muted-foreground">
                            {customer && (
                              <span className="flex items-center gap-1 truncate">
                                <Building2 className="w-3 h-3 shrink-0" />
                                <span className="truncate">{customer.name}</span>
                              </span>
                            )}
                            {project.location && (
                              <span 
                                role="button"
                                tabIndex={0}
                                className="flex items-center gap-1 text-primary hover:underline cursor-pointer"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.location || '')}`, '_blank');
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(project.location || '')}`, '_blank');
                                  }
                                }}
                                data-testid={`link-project-address-list-${project.id}`}
                              >
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span className="truncate">{project.location}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {project.createdAt && (
                            <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:block">
                              {format(new Date(project.createdAt), "MMM d, yyyy")}
                            </span>
                          )}
                          <ArrowRight className="w-4 h-4 text-primary" />
                        </div>
                      </div>
                    </CardContent>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
