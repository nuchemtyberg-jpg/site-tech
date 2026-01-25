import { useState } from "react";
import { useEquipment, useCreateEquipment, useDeleteEquipment } from "@/hooks/use-equipment";
import { 
  Plus, 
  Search, 
  Truck, 
  Wrench, 
  AlertTriangle, 
  CheckCircle, 
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertEquipmentSchema, type InsertEquipment } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function EquipmentPage() {
  const { data: equipment, isLoading } = useEquipment();
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { toast } = useToast();
  const createMutation = useCreateEquipment();
  const deleteMutation = useDeleteEquipment();

  const filteredEquipment = equipment?.filter(e => 
    e.name.toLowerCase().includes(search.toLowerCase()) || 
    e.type.toLowerCase().includes(search.toLowerCase())
  );

  const form = useForm<InsertEquipment>({
    resolver: zodResolver(insertEquipmentSchema),
    defaultValues: {
      name: "",
      type: "excavator",
      status: "available",
      notes: "",
    }
  });

  const onSubmit = (data: InsertEquipment) => {
    createMutation.mutate(data, {
      onSuccess: () => {
        setIsCreateOpen(false);
        form.reset();
        toast({ title: "Equipment Added", description: "New equipment has been added to inventory." });
      },
      onError: (err) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    });
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast({ title: "Deleted", description: "Equipment removed from inventory." });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to delete equipment.", variant: "destructive" });
      }
    });
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'available': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'in_use': return <Truck className="w-4 h-4 text-blue-500" />;
      case 'maintenance': return <Wrench className="w-4 h-4 text-orange-500" />;
      case 'repair': return <AlertTriangle className="w-4 h-4 text-red-500" />;
      default: return <CheckCircle className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-8 animate-enter">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Equipment Inventory</h1>
          <p className="text-muted-foreground mt-1">Track fleet status and availability</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="shadow-lg shadow-primary/20">
              <Plus className="mr-2 h-4 w-4" /> Add Equipment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Equipment</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name / ID</Label>
                <Input id="name" {...form.register("name")} placeholder="e.g. CAT Excavator 320" />
                {form.formState.errors.name && <p className="text-red-500 text-xs">{form.formState.errors.name.message}</p>}
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="type">Type</Label>
                <Select onValueChange={(val) => form.setValue("type", val)} defaultValue="excavator">
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excavator">Excavator</SelectItem>
                    <SelectItem value="dozer">Dozer</SelectItem>
                    <SelectItem value="crane">Crane</SelectItem>
                    <SelectItem value="truck">Truck</SelectItem>
                    <SelectItem value="tool">Tool / Small Equipment</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="status">Status</Label>
                <Select onValueChange={(val) => form.setValue("status", val)} defaultValue="available">
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="in_use">In Use</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="repair">Repair Needed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" {...form.register("notes")} placeholder="Condition, location, etc." />
              </div>

              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Adding..." : "Add Equipment"}
                </Button>
              </DialogFooter>
            </form>
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
          />
        </div>
        
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading inventory...</div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Equipment Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEquipment?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No equipment found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredEquipment?.map((item) => (
                  <TableRow key={item.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="capitalize">{item.type}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(item.status)}
                        <span className="capitalize">{item.status.replace('_', ' ')}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.notes || '-'}</TableCell>
                    <TableCell className="text-right">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Equipment</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to remove {item.name} from inventory? This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(item.id)} className="bg-destructive hover:bg-destructive/90">
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
