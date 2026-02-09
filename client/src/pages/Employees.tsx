import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { RefreshCw, Search, Users, Phone, Mail, MapPin, Briefcase, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import type { FingercheckEmployee } from "@shared/schema";

export default function EmployeesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [selectedEmployee, setSelectedEmployee] = useState<FingercheckEmployee | null>(null);
  const { toast } = useToast();

  const { data: employees = [], isLoading } = useQuery<FingercheckEmployee[]>({
    queryKey: ["/api/employees"],
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/employees/sync");
    },
    onSuccess: async (response) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: `Synced ${data.count} employees from Fingercheck` });
    },
    onError: (error: any) => {
      toast({ 
        title: "Sync failed", 
        description: error.message || "Could not connect to Fingercheck. Please check your API credentials.",
        variant: "destructive" 
      });
    },
  });

  const filteredEmployees = employees.filter((e) => {
    const matchesSearch =
      !search ||
      `${e.firstName} ${e.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      e.employeeNumber?.toLowerCase().includes(search.toLowerCase()) ||
      e.email?.toLowerCase().includes(search.toLowerCase()) ||
      e.jobTitle?.toLowerCase().includes(search.toLowerCase()) ||
      e.department?.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === "all" || e.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const activeCount = employees.filter((e) => e.status === "active").length;
  const terminatedCount = employees.filter((e) => e.status === "terminated").length;
  const lastSynced = employees.length > 0
    ? employees.reduce((latest, e) => {
        const syncDate = e.lastSyncedAt ? new Date(e.lastSyncedAt) : new Date(0);
        return syncDate > latest ? syncDate : latest;
      }, new Date(0))
    : null;

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Employees</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {employees.length > 0
              ? `${activeCount} active, ${terminatedCount} terminated`
              : "Sync employees from Fingercheck to get started"}
            {lastSynced && lastSynced.getTime() > 0 && (
              <span className="ml-2">
                · Last synced {lastSynced.toLocaleDateString()} {lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          data-testid="button-sync-employees"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          {syncMutation.isPending ? "Syncing..." : "Sync from Fingercheck"}
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-employees"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={statusFilter === "active" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("active")}
            data-testid="button-filter-active"
          >
            Active ({activeCount})
          </Button>
          <Button
            variant={statusFilter === "terminated" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("terminated")}
            data-testid="button-filter-terminated"
          >
            Terminated ({terminatedCount})
          </Button>
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("all")}
            data-testid="button-filter-all"
          >
            All ({employees.length})
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : employees.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No employees yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Click "Sync from Fingercheck" to pull your employee data from Fingercheck into SiteTech.
            </p>
            <Button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              data-testid="button-sync-employees-empty"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              {syncMutation.isPending ? "Syncing..." : "Sync from Fingercheck"}
            </Button>
          </CardContent>
        </Card>
      ) : filteredEmployees.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Search className="w-10 h-10 text-muted-foreground mb-3" />
            <h3 className="text-lg font-semibold mb-1">No matching employees</h3>
            <p className="text-sm text-muted-foreground">Try adjusting your search or filter.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop Table */}
          <Card className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.map((emp) => (
                  <TableRow
                    key={emp.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedEmployee(emp)}
                    data-testid={`row-employee-${emp.id}`}
                  >
                    <TableCell className="font-medium">
                      <div>
                        <span data-testid={`text-employee-name-${emp.id}`}>{emp.firstName} {emp.lastName}</span>
                        {emp.employeeNumber && (
                          <span className="text-xs text-muted-foreground ml-2">#{emp.employeeNumber}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{emp.jobTitle || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{emp.department || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{emp.email || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{emp.phone || emp.mobilePhone || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={emp.status === "active" ? "default" : "secondary"}>
                        {emp.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {filteredEmployees.map((emp) => (
              <Card
                key={emp.id}
                className="hover-elevate cursor-pointer"
                onClick={() => setSelectedEmployee(emp)}
                data-testid={`card-employee-${emp.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{emp.firstName} {emp.lastName}</span>
                        <Badge variant={emp.status === "active" ? "default" : "secondary"} className="text-xs">
                          {emp.status}
                        </Badge>
                      </div>
                      {emp.jobTitle && (
                        <p className="text-sm text-muted-foreground mt-1">{emp.jobTitle}</p>
                      )}
                      {emp.email && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">{emp.email}</p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Employee Detail Dialog */}
      <Dialog open={!!selectedEmployee} onOpenChange={() => setSelectedEmployee(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle data-testid="text-employee-detail-name">
              {selectedEmployee?.firstName} {selectedEmployee?.lastName}
            </DialogTitle>
          </DialogHeader>
          {selectedEmployee && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant={selectedEmployee.status === "active" ? "default" : "secondary"}>
                  {selectedEmployee.status}
                </Badge>
                {selectedEmployee.employeeNumber && (
                  <span className="text-sm text-muted-foreground">Employee #{selectedEmployee.employeeNumber}</span>
                )}
                {selectedEmployee.isSupervisor && (
                  <Badge variant="outline">Supervisor</Badge>
                )}
              </div>

              <div className="grid gap-3">
                {selectedEmployee.jobTitle && (
                  <div className="flex items-center gap-3">
                    <Briefcase className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{selectedEmployee.jobTitle}</p>
                      {selectedEmployee.department && (
                        <p className="text-xs text-muted-foreground">{selectedEmployee.department}</p>
                      )}
                    </div>
                  </div>
                )}

                {selectedEmployee.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <a href={`mailto:${selectedEmployee.email}`} className="text-sm text-primary hover:underline">
                      {selectedEmployee.email}
                    </a>
                  </div>
                )}

                {(selectedEmployee.phone || selectedEmployee.mobilePhone) && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      {selectedEmployee.phone && <p className="text-sm">{selectedEmployee.phone}</p>}
                      {selectedEmployee.mobilePhone && selectedEmployee.mobilePhone !== selectedEmployee.phone && (
                        <p className="text-sm text-muted-foreground">{selectedEmployee.mobilePhone} (mobile)</p>
                      )}
                    </div>
                  </div>
                )}

                {(selectedEmployee.address1 || selectedEmployee.city) && (
                  <div className="flex items-center gap-3">
                    <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div>
                      {selectedEmployee.address1 && <p className="text-sm">{selectedEmployee.address1}</p>}
                      {selectedEmployee.address2 && <p className="text-sm">{selectedEmployee.address2}</p>}
                      {(selectedEmployee.city || selectedEmployee.state || selectedEmployee.zipCode) && (
                        <p className="text-sm">
                          {[selectedEmployee.city, selectedEmployee.state].filter(Boolean).join(", ")}
                          {selectedEmployee.zipCode && ` ${selectedEmployee.zipCode}`}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t pt-3 mt-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {selectedEmployee.hireDate && (
                    <div>
                      <p className="text-muted-foreground text-xs">Hire Date</p>
                      <p>{new Date(selectedEmployee.hireDate).toLocaleDateString()}</p>
                    </div>
                  )}
                  {selectedEmployee.terminationDate && (
                    <div>
                      <p className="text-muted-foreground text-xs">Termination Date</p>
                      <p>{new Date(selectedEmployee.terminationDate).toLocaleDateString()}</p>
                    </div>
                  )}
                  {selectedEmployee.payType && (
                    <div>
                      <p className="text-muted-foreground text-xs">Pay Type</p>
                      <p>{selectedEmployee.payType}</p>
                    </div>
                  )}
                  {selectedEmployee.location && (
                    <div>
                      <p className="text-muted-foreground text-xs">Location</p>
                      <p>{selectedEmployee.location}</p>
                    </div>
                  )}
                  {selectedEmployee.position && (
                    <div>
                      <p className="text-muted-foreground text-xs">Position</p>
                      <p>{selectedEmployee.position}</p>
                    </div>
                  )}
                </div>
              </div>

              {selectedEmployee.lastSyncedAt && (
                <p className="text-xs text-muted-foreground text-right">
                  Last synced: {new Date(selectedEmployee.lastSyncedAt).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
