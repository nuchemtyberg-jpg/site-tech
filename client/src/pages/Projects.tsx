import { useState } from "react";
import { useProjects, useCreateProject } from "@/hooks/use-projects";
import { Link } from "wouter";
import { 
  Plus, 
  Search, 
  MapPin, 
  Calendar, 
  MoreHorizontal,
  ArrowRight
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
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertProjectSchema, type InsertProject } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export default function Projects() {
  const { data: projects, isLoading } = useProjects();
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { toast } = useToast();
  const createMutation = useCreateProject();

  const filteredProjects = projects?.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.location.toLowerCase().includes(search.toLowerCase())
  );

  const form = useForm<InsertProject>({
    resolver: zodResolver(insertProjectSchema),
    defaultValues: {
      name: "",
      description: "",
      location: "",
      status: "planning",
      color: "#f97316",
    }
  });

  const onSubmit = (data: InsertProject) => {
    createMutation.mutate(data, {
      onSuccess: () => {
        setIsCreateOpen(false);
        form.reset();
        toast({ title: "Project Created", description: "New project has been added successfully." });
      },
      onError: (err) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-8 animate-enter">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-muted-foreground mt-1">Manage construction sites and timelines</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="shadow-lg shadow-primary/20">
              <Plus className="mr-2 h-4 w-4" /> New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Project Name</Label>
                <Input id="name" {...form.register("name")} placeholder="e.g. Downtown Office Complex" />
                {form.formState.errors.name && <p className="text-red-500 text-xs">{form.formState.errors.name.message}</p>}
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Input id="description" {...form.register("description")} placeholder="Brief overview..." />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="location">Location</Label>
                <Input id="location" {...form.register("location")} placeholder="123 Main St, City" />
                {form.formState.errors.location && <p className="text-red-500 text-xs">{form.formState.errors.location.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input id="startDate" type="date" {...form.register("startDate", { valueAsDate: true })} />
                  {form.formState.errors.startDate && <p className="text-red-500 text-xs">{form.formState.errors.startDate.message}</p>}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input id="endDate" type="date" {...form.register("endDate", { valueAsDate: true })} />
                  {form.formState.errors.endDate && <p className="text-red-500 text-xs">{form.formState.errors.endDate.message}</p>}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="status">Status</Label>
                <Select onValueChange={(val) => form.setValue("status", val)} defaultValue="planning">
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planning">Planning</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating..." : "Create Project"}
                </Button>
              </DialogFooter>
            </form>
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
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 rounded-xl bg-card animate-pulse border border-border" />
          ))}
        </div>
      ) : filteredProjects?.length === 0 ? (
        <div className="text-center py-20 bg-card/50 rounded-xl border border-dashed border-border">
          <MapPin className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-xl font-medium">No projects found</h3>
          <p className="text-muted-foreground mt-2">Create your first project to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects?.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <div className="group bg-card hover:bg-card/80 border border-border hover:border-primary/50 rounded-xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 cursor-pointer flex flex-col h-full">
                <div className="h-2 w-full" style={{ backgroundColor: project.color }} />
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className={`inline-block px-2 py-1 rounded text-xs font-semibold tracking-wide uppercase mb-2 ${
                        project.status === 'active' ? 'bg-green-500/10 text-green-500' :
                        project.status === 'planning' ? 'bg-blue-500/10 text-blue-500' :
                        project.status === 'completed' ? 'bg-muted text-muted-foreground' :
                        'bg-yellow-500/10 text-yellow-500'
                      }`}>
                        {project.status.replace('_', ' ')}
                      </span>
                      <h3 className="text-xl font-bold group-hover:text-primary transition-colors">{project.name}</h3>
                    </div>
                  </div>
                  
                  <p className="text-muted-foreground text-sm line-clamp-2 mb-6 flex-1">
                    {project.description}
                  </p>

                  <div className="space-y-3 pt-4 border-t border-border">
                    <div className="flex items-center text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4 mr-2 text-primary" />
                      {project.location}
                    </div>
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Calendar className="w-4 h-4 mr-2 text-primary" />
                      {format(new Date(project.startDate), "MMM d, yyyy")} - {format(new Date(project.endDate), "MMM d, yyyy")}
                    </div>
                  </div>
                  
                  <div className="mt-4 flex items-center justify-end text-sm font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0">
                    View Details <ArrowRight className="w-4 h-4 ml-1" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
