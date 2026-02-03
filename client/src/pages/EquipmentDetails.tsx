import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Wrench, MapPin, Calendar, Plus, Trash2 } from "lucide-react";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import type { Equipment, MaintenanceLog } from "@shared/schema";

const maintenanceSchema = z.object({
  type: z.string().min(1, "Type is required"),
  description: z.string().min(1, "Description is required"),
  performedDate: z.string().min(1, "Date is required"),
  performedBy: z.string().optional(),
  cost: z.string().optional(),
  nextDueDate: z.string().optional(),
  notes: z.string().optional(),
});

type MaintenanceFormData = z.infer<typeof maintenanceSchema>;

export default function EquipmentDetails() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const { toast } = useToast();

  const { data: equipment, isLoading } = useQuery<Equipment>({
    queryKey: ["/api/equipment", id],
    queryFn: () => fetch(`/api/equipment/${id}`).then((r) => r.json()),
  });

  const { data: maintenanceLogs = [] } = useQuery<MaintenanceLog[]>({
    queryKey: ["/api/equipment", id, "maintenance"],
    queryFn: () => fetch(`/api/equipment/${id}/maintenance`).then((r) => r.json()),
  });

  const form = useForm<MaintenanceFormData>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: {
      type: "routine",
      description: "",
      performedDate: new Date().toISOString().split("T")[0],
      performedBy: "",
      cost: "",
      nextDueDate: "",
      notes: "",
    },
  });

  const createMaintenanceMutation = useMutation({
    mutationFn: async (data: MaintenanceFormData) => {
      return apiRequest(`/api/equipment/${id}/maintenance`, {
        method: "POST",
        body: JSON.stringify({
          ...data,
          cost: data.cost ? parseInt(data.cost) : null,
          nextDueDate: data.nextDueDate || null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment", id, "maintenance"] });
      setMaintenanceDialogOpen(false);
      form.reset();
      toast({ title: "Maintenance log added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add maintenance log", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/equipment/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      navigate("/equipment");
      toast({ title: "Equipment deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete equipment", variant: "destructive" });
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

  if (!equipment) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">Equipment not found</h2>
        <Button variant="link" onClick={() => navigate("/equipment")}>
          Back to Equipment
        </Button>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    available: "bg-green-500/10 text-green-500 border-green-500/20",
    in_use: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    maintenance: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    repair: "bg-red-500/10 text-red-500 border-red-500/20",
    out_of_service: "bg-gray-500/10 text-gray-500 border-gray-500/20",
  };

  const maintenanceTypes: Record<string, string> = {
    routine: "Routine",
    repair: "Repair",
    inspection: "Inspection",
    service: "Service",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/equipment")} data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{equipment.name}</h1>
          <p className="text-muted-foreground capitalize">{equipment.type.replace("_", " ")}</p>
        </div>
        <Badge className={statusColors[equipment.status] || ""} variant="outline">
          {equipment.status.replace("_", " ")}
        </Badge>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setDeleteConfirmOpen(true)}
          data-testid="button-delete-equipment"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Equipment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {equipment.make && (
              <div>
                <span className="text-sm text-muted-foreground">Make</span>
                <p className="font-medium">{equipment.make}</p>
              </div>
            )}
            {equipment.model && (
              <div>
                <span className="text-sm text-muted-foreground">Model</span>
                <p className="font-medium">{equipment.model}</p>
              </div>
            )}
            {equipment.year && (
              <div>
                <span className="text-sm text-muted-foreground">Year</span>
                <p className="font-medium">{equipment.year}</p>
              </div>
            )}
            {equipment.serialNumber && (
              <div>
                <span className="text-sm text-muted-foreground">Serial Number</span>
                <p className="font-medium">{equipment.serialNumber}</p>
              </div>
            )}
            {equipment.currentLocation && (
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground mt-1" />
                <div>
                  <span className="text-sm text-muted-foreground">Current Location</span>
                  <p className="font-medium">{equipment.currentLocation}</p>
                </div>
              </div>
            )}
            {equipment.lastServiceDate && (
              <div className="flex items-start gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground mt-1" />
                <div>
                  <span className="text-sm text-muted-foreground">Last Service</span>
                  <p className="font-medium">{format(new Date(equipment.lastServiceDate), "MMM d, yyyy")}</p>
                </div>
              </div>
            )}
            {equipment.nextServiceDate && (
              <div className="flex items-start gap-2">
                <Wrench className="w-4 h-4 text-muted-foreground mt-1" />
                <div>
                  <span className="text-sm text-muted-foreground">Next Service Due</span>
                  <p className="font-medium">{format(new Date(equipment.nextServiceDate), "MMM d, yyyy")}</p>
                </div>
              </div>
            )}
            {equipment.notes && (
              <div className="pt-4 border-t">
                <span className="text-sm text-muted-foreground">Notes</span>
                <p className="text-sm mt-1">{equipment.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Maintenance History</h2>
            <Dialog open={maintenanceDialogOpen} onOpenChange={setMaintenanceDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-maintenance">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Maintenance
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Log Maintenance</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit((data) => createMaintenanceMutation.mutate(data))} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-maintenance-type">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="routine">Routine</SelectItem>
                              <SelectItem value="repair">Repair</SelectItem>
                              <SelectItem value="inspection">Inspection</SelectItem>
                              <SelectItem value="service">Service</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="performedDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Date Performed</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-maintenance-date" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea placeholder="What was done..." {...field} data-testid="input-maintenance-description" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="performedBy"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Performed By</FormLabel>
                            <FormControl>
                              <Input placeholder="Technician name" {...field} data-testid="input-maintenance-by" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="cost"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cost ($)</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="0" {...field} data-testid="input-maintenance-cost" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="nextDueDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Next Due Date (optional)</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} data-testid="input-maintenance-next" />
                          </FormControl>
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
                            <Textarea placeholder="Additional notes..." {...field} data-testid="input-maintenance-notes" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setMaintenanceDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createMaintenanceMutation.isPending} data-testid="button-save-maintenance">
                        {createMaintenanceMutation.isPending ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {maintenanceLogs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Wrench className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No maintenance records yet</p>
                <Button variant="outline" onClick={() => setMaintenanceDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add First Record
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {maintenanceLogs.map((log) => (
                <Card key={log.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{maintenanceTypes[log.type] || log.type}</Badge>
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(log.performedDate), "MMM d, yyyy")}
                          </span>
                          {log.cost && (
                            <span className="text-sm font-medium text-primary">
                              ${log.cost.toLocaleString()}
                            </span>
                          )}
                        </div>
                        <p className="text-sm">{log.description}</p>
                        {log.performedBy && (
                          <p className="text-xs text-muted-foreground">By: {log.performedBy}</p>
                        )}
                        {log.nextDueDate && (
                          <p className="text-xs text-primary">
                            Next due: {format(new Date(log.nextDueDate), "MMM d, yyyy")}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Equipment Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="bg-white dark:bg-zinc-900 text-black dark:text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Equipment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this equipment? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-equipment">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deleteMutation.mutate();
                setDeleteConfirmOpen(false);
              }}
              data-testid="button-confirm-delete-equipment"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
