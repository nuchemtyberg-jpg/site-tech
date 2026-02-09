import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek, addDays, isSameDay, parseISO } from "date-fns";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Task, Project, Allocation } from "@shared/schema";

export default function Schedule() {
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: allocations = [] } = useQuery<Allocation[]>({
    queryKey: ["/api/allocations"],
  });

  const [currentDate, setCurrentDate] = useState(new Date());

  const startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));

  const nextWeek = () => setCurrentDate(addDays(currentDate, 7));
  const prevWeek = () => setCurrentDate(addDays(currentDate, -7));
  const today = () => setCurrentDate(new Date());

  const getItemsForDay = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    
    const dayTasks = tasks.filter(task => {
      if (task.scheduledDate === dateStr) return true;
      if (task.dueDate === dateStr) return true;
      return false;
    });

    const dayAllocations = allocations.filter(alloc => {
      if (!alloc.startDate || !alloc.endDate) return false;
      const allocStart = parseISO(alloc.startDate);
      const allocEnd = parseISO(alloc.endDate);
      return date >= allocStart && date <= allocEnd;
    });

    return { tasks: dayTasks, allocations: dayAllocations };
  };

  const getProjectById = (id: number | null) => {
    if (!id) return null;
    return projects.find(p => p.id === id);
  };

  return (
    <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between flex-wrap gap-4 pr-[100px] md:pr-0">
        <div>
          <h1 className="text-3xl font-bold">Scheduling</h1>
          <p className="text-muted-foreground mt-1">Weekly calendar view of tasks and allocations</p>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border p-1 rounded-lg">
          <Button variant="ghost" size="icon" onClick={prevWeek} data-testid="button-prev-week">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={today} className="px-4" data-testid="button-today">
            Today
          </Button>
          <div className="px-4 font-medium min-w-[140px] text-center">
            {format(startDate, "MMM d")} - {format(addDays(startDate, 6), "MMM d, yyyy")}
          </div>
          <Button variant="ghost" size="icon" onClick={nextWeek} data-testid="button-next-week">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden flex flex-col">
        {/* Header Row */}
        <div className="grid grid-cols-7 border-b border-border bg-muted/30">
          {weekDays.map((day) => (
            <div key={day.toString()} className={cn(
              "p-4 text-center border-r border-border last:border-r-0",
              isSameDay(day, new Date()) && "bg-primary/5"
            )}>
              <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">{format(day, "EEE")}</p>
              <div className={cn(
                "inline-flex w-8 h-8 items-center justify-center rounded-full text-sm font-bold",
                isSameDay(day, new Date()) ? "bg-primary text-primary-foreground" : "text-foreground"
              )}>
                {format(day, "d")}
              </div>
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="flex-1 grid grid-cols-7 overflow-y-auto">
          {tasksLoading ? (
            <div className="col-span-7 flex items-center justify-center h-full text-muted-foreground">
              Loading schedule...
            </div>
          ) : (
            weekDays.map((day) => {
              const { tasks: dayTasks, allocations: dayAllocs } = getItemsForDay(day);
              return (
                <div key={day.toString()} className={cn(
                  "border-r border-border last:border-r-0 p-2 min-h-[200px] relative hover:bg-muted/10 transition-colors",
                  isSameDay(day, new Date()) && "bg-primary/5"
                )}>
                  {(dayTasks.length > 0 || dayAllocs.length > 0) ? (
                    <div className="space-y-2">
                      {dayTasks.map(task => {
                        const project = getProjectById(task.projectId);
                        return (
                          <div 
                            key={task.id} 
                            className={cn(
                              "p-2 rounded border text-xs shadow-sm cursor-pointer hover:scale-[1.02] transition-transform",
                              task.priority === 'high' || task.priority === 'urgent' 
                                ? "bg-red-500/10 border-red-500/30 text-red-500" 
                                : task.status === 'completed' 
                                  ? "bg-muted text-muted-foreground border-border" 
                                  : "bg-primary/10 border-primary/20 text-foreground"
                            )}
                            style={project?.color ? { borderLeftColor: project.color, borderLeftWidth: 3 } : {}}
                            data-testid={`schedule-task-${task.id}`}
                          >
                            <div className="font-semibold truncate">{task.title}</div>
                            {project && (
                              <div className="text-[10px] opacity-70 truncate">{project.name}</div>
                            )}
                            <div className="opacity-70 text-[10px] uppercase tracking-wide mt-1">
                              {task.status.replace('_', ' ')}
                            </div>
                          </div>
                        );
                      })}
                      {dayAllocs.map(alloc => {
                        const project = getProjectById(alloc.projectId || null);
                        return (
                          <div 
                            key={alloc.id} 
                            className="p-2 rounded border text-xs shadow-sm bg-blue-500/10 border-blue-500/30"
                            data-testid={`schedule-allocation-${alloc.id}`}
                          >
                            <div className="font-semibold truncate">
                              {alloc.allocationType === 'crew' ? alloc.crewMember : 'Equipment'}
                            </div>
                            {project && (
                              <div className="text-[10px] opacity-70 truncate">{project.name}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground">
                        <Plus className="w-3 h-3 mr-1" /> Add
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
