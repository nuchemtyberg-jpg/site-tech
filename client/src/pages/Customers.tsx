import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Search, Phone, Mail, Building2, MapPin, Star, Users as UsersIcon, LayoutGrid, List } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomerCreationDialog } from "@/components/CustomerCreationDialog";
import {
  CUSTOMER_TYPE_LABELS,
  type Customer, type Contact, type CustomerType,
} from "@shared/schema";

type CustomerListItem = Customer & {
  primaryContact: Contact | null;
  matchReason: string | null;
};

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground">Manage your customer companies and contacts</p>
        </div>
        <Button data-testid="button-new-customer" onClick={() => setDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Customer
        </Button>
        <CustomerCreationDialog open={dialogOpen} onOpenChange={setDialogOpen} />
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
