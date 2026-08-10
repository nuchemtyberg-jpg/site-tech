import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useProjects } from "@/hooks/use-projects";
import {
  useAppUsers, useCreateTodo, useUpdateTodo, userDisplayName, extractApiError,
} from "@/hooks/use-todos";
import { TodoUpdates } from "@/components/TodoUpdates";
import type { TodoWithDetails } from "@shared/schema";

const formSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().optional(),
  assignedToUserId: z.string().min(1, "Please choose who this is for"),
  projectId: z.string(),
  dueDate: z.string().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  status: z.enum(["open", "in_progress", "completed", "cancelled"]),
});

type FormValues = z.infer<typeof formSchema>;

// Reusable create/edit todo form — used by the global Add Todo (My Work),
// the project Todos tab (pre-filled project), and todo editing everywhere.
export function TodoForm({ open, onOpenChange, todo, defaultProjectId }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todo?: TodoWithDetails | null;
  defaultProjectId?: number;
}) {
  const { user, isManager } = useAuth();
  const { toast } = useToast();
  const { data: users = [] } = useAppUsers();
  const { data: projects = [] } = useProjects();
  const createTodo = useCreateTodo();
  const updateTodo = useUpdateTodo();

  const isEditing = !!todo;
  // Assignees who didn't create the todo can only update its status
  const statusOnly = isEditing && !isManager && todo!.createdByUserId !== user?.id;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "", description: "", assignedToUserId: user?.id ?? "",
      projectId: defaultProjectId ? String(defaultProjectId) : "none",
      dueDate: "", priority: "normal", status: "open",
    },
  });

  useEffect(() => {
    if (!open) return;
    if (todo) {
      form.reset({
        title: todo.title,
        description: todo.description ?? "",
        assignedToUserId: todo.assignedToUserId,
        projectId: todo.projectId ? String(todo.projectId) : "none",
        dueDate: todo.dueDate ?? "",
        priority: (todo.priority as FormValues["priority"]) ?? "normal",
        status: (todo.status as FormValues["status"]) ?? "open",
      });
    } else {
      form.reset({
        title: "", description: "", assignedToUserId: user?.id ?? "",
        projectId: defaultProjectId ? String(defaultProjectId) : "none",
        dueDate: "", priority: "normal", status: "open",
      });
    }
  }, [open, todo, defaultProjectId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isPending = createTodo.isPending || updateTodo.isPending;

  const onSubmit = (values: FormValues) => {
    if (isPending) return;
    const handleError = (err: unknown) =>
      toast({ title: isEditing ? "Couldn't save todo" : "Couldn't create todo", description: extractApiError(err, "Please try again."), variant: "destructive" });

    if (isEditing) {
      const payload = statusOnly
        ? { id: todo!.id, status: values.status }
        : {
            id: todo!.id,
            title: values.title,
            description: values.description || null,
            assignedToUserId: values.assignedToUserId,
            projectId: values.projectId === "none" ? null : Number(values.projectId),
            dueDate: values.dueDate || null,
            priority: values.priority,
            status: values.status,
          };
      updateTodo.mutate(payload, {
        onSuccess: () => { toast({ title: "Todo updated" }); onOpenChange(false); },
        onError: handleError,
      });
    } else {
      createTodo.mutate({
        title: values.title,
        description: values.description || null,
        assignedToUserId: values.assignedToUserId,
        projectId: values.projectId === "none" ? null : Number(values.projectId),
        dueDate: values.dueDate || null,
        priority: values.priority,
      }, {
        onSuccess: () => { toast({ title: "Todo created" }); onOpenChange(false); },
        onError: handleError,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Todo" : "Add Todo"}</DialogTitle>
          <DialogDescription>
            {statusOnly
              ? "You're the assignee — you can update the status."
              : isEditing ? "Update the details of this todo." : "Create an action item and assign it to a team member."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem>
                <FormLabel>Title *</FormLabel>
                <FormControl>
                  <Input placeholder="What needs to be done?" {...field} disabled={statusOnly} data-testid="input-todo-title" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea placeholder="Add details (optional)" rows={3} {...field} disabled={statusOnly} data-testid="input-todo-description" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="assignedToUserId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Assign to *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={statusOnly}>
                    <FormControl>
                      <SelectTrigger data-testid="select-todo-assignee"><SelectValue placeholder="Choose a person" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {users.map(u => (
                        <SelectItem key={u.id} value={u.id}>
                          {userDisplayName(u)}{u.id === user?.id ? " (me)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="projectId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Project</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={statusOnly}>
                    <FormControl>
                      <SelectTrigger data-testid="select-todo-project"><SelectValue placeholder="No project" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">No project</SelectItem>
                      {projects.map(p => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="dueDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Due date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} disabled={statusOnly} data-testid="input-todo-due-date" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="priority" render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={statusOnly}>
                    <FormControl>
                      <SelectTrigger data-testid="select-todo-priority"><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {isEditing && (
              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-todo-status"><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            )}

            {/* Updates timeline — anyone who can open the todo can add one,
                including assignees in status-only mode and on completed todos */}
            {isEditing && todo && <TodoUpdates todoId={todo.id} />}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="min-h-[44px]" data-testid="button-todo-cancel">
                Cancel
              </Button>
              <Button type="submit" disabled={isPending} className="min-h-[44px]" data-testid="button-todo-save">
                {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEditing ? "Save Changes" : "Create Todo"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
