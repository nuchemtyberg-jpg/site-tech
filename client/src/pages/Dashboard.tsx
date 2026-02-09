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
    <div className="space-y-6 md:space-y-8 animate-enter">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pr-[100px] md:pr-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Welcome back{user?.firstName ? `, ${user.firstName}` : ""}</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">Here's what's happening with your sitework operations.</p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-lg md:text-xl font-bold font-mono text-primary">
            {format(new Date(), "EEEE, MMMM do")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Link href="/projects">
          <Card className="hover-elevate cursor-pointer shadow-sm" data-testid="card-projects-summary">
            <CardContent className="p-4 md:p-6 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs md:text-sm font-medium text-muted-foreground truncate">Active Projects</p>
                <h3 className="text-xl md:text-2xl font-bold mt-1">{activeProjects.length}</h3>
                <p className="text-xs text-muted-foreground">{projects.length} total</p>
              </div>
              <div className="w-10 h-10 md:w-12 md:h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary flex-shrink-0">
                <FolderKanban className="w-5 h-5 md:w-6 md:h-6" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/customers">
          <Card className="hover-elevate cursor-pointer shadow-sm" data-testid="card-customers-summary">
            <CardContent className="p-4 md:p-6 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs md:text-sm font-medium text-muted-foreground truncate">Customers</p>
                <h3 className="text-xl md:text-2xl font-bold mt-1">{customers.length}</h3>
                <p className="text-xs text-muted-foreground">In database</p>
              </div>
              <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500 flex-shrink-0">
                <Users className="w-5 h-5 md:w-6 md:h-6" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/equipment">
          <Card className="hover-elevate cursor-pointer shadow-sm" data-testid="card-equipment-summary">
            <CardContent className="p-4 md:p-6 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs md:text-sm font-medium text-muted-foreground truncate">Equipment</p>
                <h3 className="text-xl md:text-2xl font-bold mt-1">{equipmentByStatus.available}</h3>
                <p className="text-xs text-muted-foreground">{equipment.length} total</p>
              </div>
              <div className="w-10 h-10 md:w-12 md:h-12 bg-green-500/10 rounded-full flex items-center justify-center text-green-500 flex-shrink-0">
                <Truck className="w-5 h-5 md:w-6 md:h-6" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card className="shadow-sm" data-testid="card-value-summary">
          <CardContent className="p-4 md:p-6 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs md:text-sm font-medium text-muted-foreground truncate">Project Value</p>
              <h3 className="text-xl md:text-2xl font-bold mt-1">
                ${totalProjectValue >= 1000 ? (totalProjectValue / 1000).toFixed(0) + "k" : totalProjectValue}
              </h3>
              <p className="text-xs text-muted-foreground">Estimated</p>
            </div>
            <div className="w-10 h-10 md:w-12 md:h-12 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500 flex-shrink-0">
              <DollarSign className="w-5 h-5 md:w-6 md:h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader className="pb-2 md:pb-4">
            <CardTitle className="text-base md:text-lg">Project Status</CardTitle>
          </CardHeader>
          <CardContent>
            {projectChartData.length > 0 ? (
              <div className="h-[200px] md:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={projectChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                      labelLine={{ strokeWidth: 1 }}
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
              <div className="h-[200px] md:h-[300px] flex items-center justify-center text-muted-foreground">
                <div className="text-center px-4">
                  <FolderKanban className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No projects yet. Create your first project to get started.</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2 md:pb-4">
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <AlertCircle className="w-4 h-4 md:w-5 md:h-5 text-destructive" />
              Priority Tasks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {urgentTasks.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">All caught up! No urgent tasks.</p>
                </div>
              ) : (
                urgentTasks.slice(0, 5).map(task => (
                  <div key={task.id} className="p-3 rounded-lg bg-muted/50 border border-border flex items-start gap-3 min-h-[44px]">
                    <div className="mt-1.5 flex-shrink-0">
                      <div className="w-2 h-2 rounded-full bg-destructive" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-medium text-sm truncate">{task.title}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5 capitalize">{task.priority} priority</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <Link href="/schedule">
                <div className="flex items-center justify-center gap-2 text-primary hover:underline cursor-pointer text-sm font-medium min-h-[44px]">
                  View Full Schedule
                  <Calendar className="w-4 h-4" />
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-3 md:p-6 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs md:text-sm font-medium text-muted-foreground truncate">Pending</p>
              <h3 className="text-lg md:text-2xl font-bold mt-1">{tasksByStatus.pending}</h3>
            </div>
            <Clock className="h-6 w-6 md:h-8 md:w-8 text-yellow-500 flex-shrink-0" />
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-3 md:p-6 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs md:text-sm font-medium text-muted-foreground truncate">In Progress</p>
              <h3 className="text-lg md:text-2xl font-bold mt-1">{tasksByStatus.in_progress}</h3>
            </div>
            <AlertCircle className="h-6 w-6 md:h-8 md:w-8 text-orange-500 flex-shrink-0" />
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-3 md:p-6 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs md:text-sm font-medium text-muted-foreground truncate">Completed</p>
              <h3 className="text-lg md:text-2xl font-bold mt-1">{tasksByStatus.completed}</h3>
            </div>
            <CheckCircle2 className="h-6 w-6 md:h-8 md:w-8 text-green-500 flex-shrink-0" />
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-2 md:pb-4">
          <CardTitle className="text-base md:text-lg">Equipment Status</CardTitle>
        </CardHeader>
        <CardContent>
          {equipmentChartData.length > 0 ? (
            <div className="h-[160px] md:h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={equipmentChartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={30} />
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
            <div className="h-[160px] md:h-[200px] flex items-center justify-center text-muted-foreground">
              <div className="text-center px-4">
                <Truck className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No equipment yet. Add your first piece of equipment.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
