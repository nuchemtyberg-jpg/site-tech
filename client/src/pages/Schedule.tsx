import { useAllTasks } from "@/hooks/use-tasks";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function Schedule() {
  const { data: tasks, isLoading } = useAllTasks();
  const [currentDate, setCurrentDate] = useState(new Date());

  const startDate = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday start
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startDate, i));

  const nextWeek = () => setCurrentDate(addDays(currentDate, 7));
  const prevWeek = () => setCurrentDate(addDays(currentDate, -7));
  const today = () => setCurrentDate(new Date());

  // Group tasks by day for this view (simplified logic for MVP)
  const getTasksForDay = (date: Date) => {
    return tasks?.filter(task => {
      const taskStart = new Date(task.startDate);
      const taskEnd = new Date(task.endDate);
      // Check if date is within range
      return date >= taskStart && date <= taskEnd;
    }) || [];
  };

  return (
    <div className="space-y-6 animate-enter h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Master Schedule</h1>
          <p className="text-muted-foreground mt-1">Weekly timeline of all project tasks</p>
        </div>
        <div className="flex items-center gap-2 bg-card border border-border p-1 rounded-lg">
          <Button variant="ghost" size="icon" onClick={prevWeek}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={today} className="px-4">
            Today
          </Button>
          <div className="px-4 font-medium min-w-[140px] text-center">
            {format(startDate, "MMM d")} - {format(addDays(startDate, 6), "MMM d, yyyy")}
          </div>
          <Button variant="ghost" size="icon" onClick={nextWeek}>
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
          {isLoading ? (
             <div className="col-span-7 flex items-center justify-center h-full text-muted-foreground">
               Loading schedule...
             </div>
          ) : (
            weekDays.map((day) => {
              const dayTasks = getTasksForDay(day);
              return (
                <div key={day.toString()} className={cn(
                  "border-r border-border last:border-r-0 p-2 min-h-[200px] relative hover:bg-muted/10 transition-colors",
                  isSameDay(day, new Date()) && "bg-primary/5"
                )}>
                  {dayTasks.length > 0 ? (
                    <div className="space-y-2">
                      {dayTasks.map(task => (
                        <div 
                          key={task.id} 
                          className={cn(
                            "p-2 rounded border text-xs shadow-sm cursor-pointer hover:scale-[1.02] transition-transform",
                            task.priority === 'high' ? "bg-red-500/10 border-red-500/30 text-red-500" :
                            task.status === 'completed' ? "bg-muted text-muted-foreground border-border" :
                            "bg-primary/10 border-primary/20 text-foreground"
                          )}
                        >
                          <div className="font-semibold truncate">{task.title}</div>
                          <div className="opacity-70 text-[10px] uppercase tracking-wide mt-1">
                            {task.status.replace('_', ' ')}
                          </div>
                        </div>
                      ))}
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
