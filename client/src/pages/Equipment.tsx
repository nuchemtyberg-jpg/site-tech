import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, Search, Truck, Wrench, AlertTriangle, CheckCircle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Equipment } from "@shared/schema";

const equipmentFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.string().min(1, "Type is required"),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.string().optional(),
  serialNumber: z.string().optional(),
  status: z.string().default("available"),
  currentLocation: z.string().optional(),
  notes: z.string().optional(),
});

type EquipmentFormData = z.infer<typeof equipmentFormSchema>;

export default function EquipmentPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: equipment = [], isLoading } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
  });

  const form = useForm<EquipmentFormData>({
    resolver: zodResolver(equipmentFormSchema),
    defaultValues: {
      name: "",
      type: "excavator",
      make: "",
      model: "",
      year: "",
      serialNumber: "",
      status: "available",
      currentLocation: "",
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: EquipmentFormData) => {
      return apiRequest("POST", "/api/equipment", {
        ...data,
        year: data.year ? parseInt(data.year) : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      setDialogOpen(false);
      form.reset();
      toast({ title: "Equipment added successfully" });
    },
    onError: () => {
      toast({ title: "Failed to add equipment", variant: "destructive" });
    },
  });

  const filteredEquipment = equipment.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.type.toLowerCase().includes(search.toLowerCase()) ||
      e.make?.toLowerCase().includes(search.toLowerCase()) ||
      e.model?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "available":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "in_use":
        return <Truck className="w-4 h-4 text-blue-500" />;
      case "maintenance":
        return <Wrench className="w-4 h-4 text-orange-500" />;
      case "repair":
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case "out_of_service":
        return <AlertTriangle className="w-4 h-4 text-gray-500" />;
      default:
        return <CheckCircle className="w-4 h-4" />;
    }
  };

  const equipmentTypes = [
    { value: "excavator", label: "Excavator" },
    { value: "dozer", label: "Dozer" },
    { value: "loader", label: "Loader" },
    { value: "truck", label: "Truck" },
    { value: "trailer", label: "Trailer" },
    { value: "compactor", label: "Compactor" },
    { value: "grader", label: "Grader" },
    { value: "skid_steer", label: "Skid Steer" },
    { value: "crane", label: "Crane" },
    { value: "other", label: "Other" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Equipment</h1>
          <p className="text-muted-foreground mt-1">Track your fleet and inventory</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-equipment">
              <Plus className="mr-2 h-4 w-4" /> Add Equipment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Equipment</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name / ID *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. CAT 320 #1" {...field} data-testid="input-equipment-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-equipment-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {equipmentTypes.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="make"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Make</FormLabel>
                        <FormControl>
                          <Input placeholder="Caterpillar" {...field} data-testid="input-equipment-make" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="model"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Model</FormLabel>
                        <FormControl>
                          <Input placeholder="320" {...field} data-testid="input-equipment-model" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="year"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Year</FormLabel>
                        <FormControl>
                          <Input type="number" placeholder="2022" {...field} data-testid="input-equipment-year" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="serialNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Serial Number</FormLabel>
                        <FormControl>
                          <Input placeholder="ABC123456" {...field} data-testid="input-equipment-serial" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-equipment-status">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="available">Available</SelectItem>
                            <SelectItem value="in_use">In Use</SelectItem>
                            <SelectItem value="maintenance">Maintenance</SelectItem>
                            <SelectItem value="repair">Repair</SelectItem>
                            <SelectItem value="out_of_service">Out of Service</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="currentLocation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Location</FormLabel>
                      <FormControl>
                        <Input placeholder="Main yard, Job site, etc." {...field} data-testid="input-equipment-location" />
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
                        <Textarea placeholder="Condition, maintenance notes..." {...field} data-testid="input-equipment-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-equipment">
                    {createMutation.isPending ? "Adding..." : "Add Equipment"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <Search className="w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Filter equipment..."
            className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 max-w-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-equipment"
          />
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading inventory...</div>
        ) : filteredEquipment.length === 0 ? (
          <div className="p-12 text-center">
            <Truck className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
            <h3 className="text-lg font-medium mb-2">No equipment found</h3>
            <p className="text-muted-foreground mb-4">Add your first piece of equipment to track</p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Equipment
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Equipment Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Make / Model</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEquipment.map((item) => (
                <TableRow key={item.id} className="hover:bg-muted/30" data-testid={`row-equipment-${item.id}`}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="capitalize">{item.type.replace("_", " ")}</TableCell>
                  <TableCell>
                    {item.make || item.model ? (
                      <>
                        {item.make} {item.model} {item.year ? `(${item.year})` : ""}
                      </>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(item.status)}
                      <span className="capitalize">{item.status.replace("_", " ")}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.currentLocation || "-"}</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/equipment/${item.id}`}>
                      <Button variant="ghost" size="icon" data-testid={`button-view-equipment-${item.id}`}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
