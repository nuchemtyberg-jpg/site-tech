import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderKanban, Users, Truck, CheckCircle2, Clock, AlertCircle, DollarSign, Calendar } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { format } from "date-fns";
import type { Project, Customer, Equipment, Task } from "@shared/schema";

export default function Dashboard() {
  const { user } = useAuth();
  
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: equipment = [] } = useQuery<Equipment[]>({
    queryKey: ["/api/equipment"],
  });

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const projectsByStatus = {
    bidding: projects.filter((p) => p.status === "bidding").length,
    awarded: projects.filter((p) => p.status === "awarded").length,
    in_progress: projects.filter((p) => p.status === "in_progress").length,
    completed: projects.filter((p) => p.status === "completed").length,
    on_hold: projects.filter((p) => p.status === "on_hold").length,
  };

  const equipmentByStatus = {
    available: equipment.filter((e) => e.status === "available").length,
    in_use: equipment.filter((e) => e.status === "in_use").length,
    maintenance: equipment.filter((e) => e.status === "maintenance").length,
    repair: equipment.filter((e) => e.status === "repair").length,
  };

  const tasksByStatus = {
    pending: tasks.filter((t) => t.status === "pending").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    completed: tasks.filter((t) => t.status === "completed").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
  };

  const urgentTasks = tasks.filter(t => t.priority === "high" || t.priority === "urgent");

  const projectChartData = [
    { name: "Bidding", value: projectsByStatus.bidding, color: "#6366f1" },
    { name: "Awarded", value: projectsByStatus.awarded, color: "#22c55e" },
    { name: "In Progress", value: projectsByStatus.in_progress, color: "#f97316" },
    { name: "Completed", value: projectsByStatus.completed, color: "#10b981" },
    { name: "On Hold", value: projectsByStatus.on_hold, color: "#eab308" },
  ].filter((d) => d.value > 0);

  const equipmentChartData = [
    { name: "Available", value: equipmentByStatus.available, color: "#22c55e" },
    { name: "In Use", value: equipmentByStatus.in_use, color: "#3b82f6" },
    { name: "Maintenance", value: equipmentByStatus.maintenance, color: "#eab308" },
    { name: "Repair", value: equipmentByStatus.repair, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  const totalProjectValue = projects.reduce((sum, p) => sum + (p.estimatedValue || 0), 0);
  const activeProjects = projects.filter((p) => p.status === "in_progress" || p.status === "awarded");

  return (
    <div className="space-y-8 animate-enter">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Welcome back{user?.firstName ? `, ${user.firstName}` : ""}</h1>
          <p className="text-muted-foreground mt-1">Here's what's happening with your sitework operations.</p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-xl font-bold font-mono text-primary">
            {format(new Date(), "EEEE, MMMM do")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/projects">
          <Card className="hover-elevate cursor-pointer" data-testid="card-projects-summary">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Projects</p>
                <h3 className="text-2xl font-bold mt-1">{activeProjects.length}</h3>
                <p className="text-xs text-muted-foreground">{projects.length} total</p>
              </div>
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <FolderKanban className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/customers">
          <Card className="hover-elevate cursor-pointer" data-testid="card-customers-summary">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Customers</p>
                <h3 className="text-2xl font-bold mt-1">{customers.length}</h3>
                <p className="text-xs text-muted-foreground">In database</p>
              </div>
              <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500">
                <Users className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/equipment">
          <Card className="hover-elevate cursor-pointer" data-testid="card-equipment-summary">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Equipment Available</p>
                <h3 className="text-2xl font-bold mt-1">{equipmentByStatus.available}</h3>
                <p className="text-xs text-muted-foreground">{equipment.length} total</p>
              </div>
              <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center text-green-500">
                <Truck className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card data-testid="card-value-summary">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Project Value</p>
              <h3 className="text-2xl font-bold mt-1">
                ${totalProjectValue >= 1000 ? (totalProjectValue / 1000).toFixed(0) + "k" : totalProjectValue}
              </h3>
              <p className="text-xs text-muted-foreground">Total estimated</p>
            </div>
            <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500">
              <DollarSign className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Project Status Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {projectChartData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={projectChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {projectChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <FolderKanban className="w-12 h-12 mx-auto mb-2 opacity-20" />
                  <p>No projects yet. Create your first project to get started.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Priority Tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {urgentTasks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-2 opacity-20" />
                  <p>All caught up! No urgent tasks.</p>
                </div>
              ) : (
                urgentTasks.slice(0, 5).map(task => (
                  <div key={task.id} className="p-3 rounded-lg bg-card border border-border flex items-start gap-3 hover:bg-muted/50 transition-colors">
                    <div className="mt-1">
                      <div className="w-2 h-2 rounded-full bg-destructive" />
                    </div>
                    <div>
                      <h4 className="font-medium text-sm">{task.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1 capitalize">{task.priority} priority</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-6 pt-6 border-t border-border">
              <Link href="/schedule">
                <div className="flex items-center justify-center gap-2 text-primary hover:underline cursor-pointer text-sm font-medium">
                  View Full Schedule
                  <Calendar className="w-4 h-4" />
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Tasks Pending</p>
              <h3 className="text-2xl font-bold mt-1">{tasksByStatus.pending}</h3>
            </div>
            <Clock className="h-8 w-8 text-yellow-500" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Tasks In Progress</p>
              <h3 className="text-2xl font-bold mt-1">{tasksByStatus.in_progress}</h3>
            </div>
            <AlertCircle className="h-8 w-8 text-orange-500" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Tasks Completed</p>
              <h3 className="text-2xl font-bold mt-1">{tasksByStatus.completed}</h3>
            </div>
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Equipment Status</CardTitle>
        </CardHeader>
        <CardContent>
          {equipmentChartData.length > 0 ? (
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={equipmentChartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {equipmentChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Truck className="w-12 h-12 mx-auto mb-2 opacity-20" />
                <p>No equipment yet. Add your first piece of equipment to track.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
