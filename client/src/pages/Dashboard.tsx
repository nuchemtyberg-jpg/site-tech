import { useAuth } from "@/hooks/use-auth";
import { useProjects } from "@/hooks/use-projects";
import { useAllTasks } from "@/hooks/use-tasks";
import { useEquipment } from "@/hooks/use-equipment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LayoutDashboard, Clock, AlertCircle, CheckCircle2, HardHat } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { format } from "date-fns";
import { Link } from "wouter";

export default function Dashboard() {
  const { user } = useAuth();
  const { data: projects } = useProjects();
  const { data: tasks } = useAllTasks();
  const { data: equipment } = useEquipment();

  const activeProjects = projects?.filter(p => p.status === 'active') || [];
  const pendingTasks = tasks?.filter(t => t.status === 'pending' || t.status === 'in_progress') || [];
  const urgentTasks = tasks?.filter(t => t.priority === 'high' && t.status !== 'completed') || [];
  const availableEquipment = equipment?.filter(e => e.status === 'available') || [];

  // Chart Data Preparation
  const projectStatusData = [
    { name: 'Planning', value: projects?.filter(p => p.status === 'planning').length || 0 },
    { name: 'Active', value: projects?.filter(p => p.status === 'active').length || 0 },
    { name: 'Completed', value: projects?.filter(p => p.status === 'completed').length || 0 },
    { name: 'On Hold', value: projects?.filter(p => p.status === 'on_hold').length || 0 },
  ];

  return (
    <div className="space-y-8 animate-enter">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Welcome back, {user?.firstName}</h1>
          <p className="text-muted-foreground mt-1">Here's what's happening on your sites today.</p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-xl font-bold font-mono text-primary">
            {format(new Date(), "EEEE, MMMM do")}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass hover:border-primary/50 transition-colors">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Projects</p>
              <h3 className="text-2xl font-bold mt-1">{activeProjects.length}</h3>
            </div>
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary">
              <LayoutDashboard className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass hover:border-primary/50 transition-colors">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Pending Tasks</p>
              <h3 className="text-2xl font-bold mt-1">{pendingTasks.length}</h3>
            </div>
            <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500">
              <Clock className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass hover:border-primary/50 transition-colors">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Urgent Issues</p>
              <h3 className="text-2xl font-bold mt-1">{urgentTasks.length}</h3>
            </div>
            <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center text-destructive">
              <AlertCircle className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="glass hover:border-primary/50 transition-colors">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Available Fleet</p>
              <h3 className="text-2xl font-bold mt-1">{availableEquipment.length}</h3>
            </div>
            <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center text-green-500">
              <Truck className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Project Status Chart */}
        <Card className="lg:col-span-2 glass">
          <CardHeader>
            <CardTitle>Project Status Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectStatusData}>
                  <XAxis 
                    dataKey="name" 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <YAxis 
                    stroke="#888888" 
                    fontSize={12} 
                    tickLine={false} 
                    axisLine={false} 
                  />
                  <Tooltip 
                    cursor={{fill: 'rgba(255,255,255,0.05)'}}
                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                  />
                  <Bar 
                    dataKey="value" 
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]} 
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity / Urgent Tasks */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Priority Actions
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
                      <h4 className="font-medium text-sm text-foreground">{task.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1">Due: {format(new Date(task.endDate), 'MMM d')}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="mt-6 pt-6 border-t border-border">
               <Link href="/schedule">
                 <div className="flex items-center justify-center gap-2 text-primary hover:underline cursor-pointer text-sm font-medium">
                   View Full Schedule
                   <HardHat className="w-4 h-4" />
                 </div>
               </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
