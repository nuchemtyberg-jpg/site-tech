import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Zap, Pencil, Trash2, Loader2, AlertTriangle, Mail, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from "@/components/ui/form";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  useWorkflowRules, useCreateWorkflowRule, useUpdateWorkflowRule, useDeleteWorkflowRule,
  useAppUsers, userDisplayName, extractApiError,
} from "@/hooks/use-todos";
import { PROJECT_STATUSES, getProjectStatusLabel } from "@shared/projectStatus";
import { OPPORTUNITY_STATUSES, getOpportunityStatusLabel } from "@shared/opportunityStatus";
import type { WorkflowRuleWithDetails } from "@shared/schema";

const ruleFormSchema = z.object({
  name: z.string().trim().min(1, "Give this rule a name"),
  triggerType: z.enum(["project_status_change", "opportunity_status_change"]),
  triggerStatus: z.string().min(1, "Choose a status"),
  assignedToUserId: z.string().min(1, "Choose who gets the work"),
  createTodo: z.boolean(),
  todoTitle: z.string().optional(),
  todoDescription: z.string().optional(),
  todoPriority: z.enum(["low", "normal", "high", "urgent"]),
  dueOffsetType: z.enum(["immediately", "days", "none"]),
  dueOffsetDays: z.string().optional(),
  sendInAppNotification: z.boolean(),
  sendEmailNotification: z.boolean(),
  isActive: z.boolean(),
}).superRefine((data, ctx) => {
  if (data.createTodo && !data.todoTitle?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["todoTitle"], message: "What should the todo say?" });
  }
  if (data.dueOffsetType === "days") {
    const n = Number(data.dueOffsetDays);
    if (!data.dueOffsetDays || isNaN(n) || n < 0 || !Number.isInteger(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dueOffsetDays"], message: "Enter the number of days" });
    }
  }
});

type RuleFormValues = z.infer<typeof ruleFormSchema>;

const DEFAULT_VALUES: RuleFormValues = {
  name: "", triggerType: "project_status_change", triggerStatus: "", assignedToUserId: "", createTodo: true,
  todoTitle: "", todoDescription: "", todoPriority: "normal",
  dueOffsetType: "none", dueOffsetDays: "3",
  sendInAppNotification: true, sendEmailNotification: false, isActive: true,
};

function dueOffsetText(rule: WorkflowRuleWithDetails): string {
  if (rule.dueOffsetType === "immediately") return "Due same day";
  if (rule.dueOffsetType === "days") return `Due in ${rule.dueOffsetDays ?? 0} day${rule.dueOffsetDays === 1 ? "" : "s"}`;
  return "No due date";
}

export default function WorkflowRules() {
  const { toast } = useToast();
  const { data: rules = [], isLoading } = useWorkflowRules();
  const { data: users = [] } = useAppUsers();
  const createRule = useCreateWorkflowRule();
  const updateRule = useUpdateWorkflowRule();
  const deleteRule = useDeleteWorkflowRule();

  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<WorkflowRuleWithDetails | null>(null);
  const [deletingRule, setDeletingRule] = useState<WorkflowRuleWithDetails | null>(null);

  const form = useForm<RuleFormValues>({ resolver: zodResolver(ruleFormSchema), defaultValues: DEFAULT_VALUES });
  const watchCreateTodo = form.watch("createTodo");
  const watchDueOffsetType = form.watch("dueOffsetType");
  const watchTriggerType = form.watch("triggerType");
  const statusOptions = watchTriggerType === "opportunity_status_change" ? OPPORTUNITY_STATUSES : PROJECT_STATUSES;

  useEffect(() => {
    if (!formOpen) return;
    if (editingRule) {
      form.reset({
        name: editingRule.name,
        triggerType: (editingRule.triggerType as RuleFormValues["triggerType"]) ?? "project_status_change",
        triggerStatus: editingRule.triggerStatus,
        assignedToUserId: editingRule.assignedToUserId,
        createTodo: editingRule.createTodo,
        todoTitle: editingRule.todoTitle ?? "",
        todoDescription: editingRule.todoDescription ?? "",
        todoPriority: (editingRule.todoPriority as RuleFormValues["todoPriority"]) ?? "normal",
        dueOffsetType: (editingRule.dueOffsetType as RuleFormValues["dueOffsetType"]) ?? "none",
        dueOffsetDays: editingRule.dueOffsetDays != null ? String(editingRule.dueOffsetDays) : "3",
        sendInAppNotification: editingRule.sendInAppNotification,
        sendEmailNotification: editingRule.sendEmailNotification,
        isActive: editingRule.isActive,
      });
    } else {
      form.reset(DEFAULT_VALUES);
    }
  }, [formOpen, editingRule]); // eslint-disable-line react-hooks/exhaustive-deps

  const isPending = createRule.isPending || updateRule.isPending;

  const onSubmit = (values: RuleFormValues) => {
    if (isPending) return;
    const payload = {
      name: values.name.trim(),
      isActive: values.isActive,
      triggerType: values.triggerType,
      triggerStatus: values.triggerStatus,
      assignedToUserId: values.assignedToUserId,
      createTodo: values.createTodo,
      todoTitle: values.createTodo ? (values.todoTitle?.trim() || null) : null,
      todoDescription: values.createTodo ? (values.todoDescription?.trim() || null) : null,
      todoPriority: values.todoPriority,
      dueOffsetType: values.dueOffsetType,
      dueOffsetDays: values.dueOffsetType === "days" ? Number(values.dueOffsetDays) : null,
      dueOffsetUnit: "calendar_days",
      sendInAppNotification: values.sendInAppNotification,
      sendEmailNotification: values.sendEmailNotification,
    };
    const handleError = (err: unknown) =>
      toast({ title: "Couldn't save rule", description: extractApiError(err, "Please try again."), variant: "destructive" });

    if (editingRule) {
      updateRule.mutate({ id: editingRule.id, ...payload } as any, {
        onSuccess: () => { toast({ title: "Rule updated" }); setFormOpen(false); },
        onError: handleError,
      });
    } else {
      createRule.mutate(payload as any, {
        onSuccess: () => { toast({ title: "Rule created", description: "It will run the next time a project moves to this status." }); setFormOpen(false); },
        onError: handleError,
      });
    }
  };

  const toggleActive = (rule: WorkflowRuleWithDetails, isActive: boolean) => {
    updateRule.mutate({ id: rule.id, isActive } as any, {
      onSuccess: () => toast({ title: isActive ? "Rule turned on" : "Rule turned off" }),
      onError: (err) => toast({ title: "Couldn't update rule", description: extractApiError(err, "Please try again."), variant: "destructive" }),
    });
  };

  return (
    <div className="space-y-5 pt-14 md:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-workflow-rules-title">
            <Zap className="w-6 h-6 text-primary" />
            Workflow Rules
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">
            Automatically hand off work when a project changes status — for example, when a project moves to
            Bidding, assign a takeoff todo to your estimator.
          </p>
        </div>
        <Button onClick={() => { setEditingRule(null); setFormOpen(true); }} className="min-h-[44px]" data-testid="button-new-rule">
          <Plus className="w-4 h-4 mr-2" />New Rule
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}</div>
      ) : rules.length === 0 ? (
        <div className="text-center py-14 border border-dashed border-border rounded-lg px-4">
          <Zap className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium">No workflow rules yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            Rules watch for project status changes and automatically create todos, so nothing falls through the
            cracks. Example: "When a project moves to Bidding → assign 'Complete takeoff' to Sam, due in 3 days."
          </p>
          <Button variant="outline" onClick={() => { setEditingRule(null); setFormOpen(true); }} className="mt-4 min-h-[44px]" data-testid="button-create-first-rule">
            <Plus className="w-4 h-4 mr-2" />Create your first rule
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <Card key={rule.id} className={!rule.isActive ? "opacity-60" : undefined} data-testid={`card-rule-${rule.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{rule.name}</p>
                      {!rule.isActive && <Badge variant="outline" className="text-[10px]">Off</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      When {rule.triggerType === "opportunity_status_change" ? "an opportunity" : "a project"} moves to <span className="font-medium text-foreground">{rule.triggerType === "opportunity_status_change" ? getOpportunityStatusLabel(rule.triggerStatus) : getProjectStatusLabel(rule.triggerStatus)}</span>
                      {rule.createTodo && rule.todoTitle ? (
                        <> → assign <span className="font-medium text-foreground">"{rule.todoTitle}"</span> to <span className="font-medium text-foreground">{rule.assignedToName || "Unknown user"}</span></>
                      ) : (
                        <> → notify <span className="font-medium text-foreground">{rule.assignedToName || "Unknown user"}</span></>
                      )}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {rule.createTodo && <Badge variant="outline" className="text-[10px]">{dueOffsetText(rule)}</Badge>}
                      {rule.createTodo && rule.todoPriority !== "normal" && (
                        <Badge variant="outline" className="text-[10px] capitalize">{rule.todoPriority} priority</Badge>
                      )}
                      {rule.sendInAppNotification && (
                        <Badge variant="outline" className="text-[10px] gap-1"><Bell className="w-2.5 h-2.5" />In-app</Badge>
                      )}
                      {rule.sendEmailNotification && (
                        <Badge variant="outline" className="text-[10px] gap-1"><Mail className="w-2.5 h-2.5" />Email</Badge>
                      )}
                    </div>
                    {!rule.assigneeIsActive && (
                      <div className="flex items-start gap-1.5 mt-2 text-amber-600 dark:text-amber-400" data-testid={`warning-inactive-assignee-${rule.id}`}>
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <p className="text-xs">
                          {rule.assignedToName || rule.assignedToEmail || "This user"} no longer has app access.
                          This rule is skipped (no todos are created) until you reassign it.
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Switch
                      checked={rule.isActive}
                      onCheckedChange={(checked) => toggleActive(rule, checked)}
                      aria-label={`Rule ${rule.name} active`}
                      data-testid={`switch-rule-active-${rule.id}`}
                    />
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => { setEditingRule(rule); setFormOpen(true); }} data-testid={`button-edit-rule-${rule.id}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => setDeletingRule(rule)} data-testid={`button-delete-rule-${rule.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Rule form dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Rule" : "New Workflow Rule"}</DialogTitle>
            <DialogDescription>
              When a project changes to the status you pick, this rule runs automatically.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Rule name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Takeoff handoff" {...field} data-testid="input-rule-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="triggerType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Watch for *</FormLabel>
                  <Select
                    onValueChange={(v) => { field.onChange(v); form.setValue("triggerStatus", ""); }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-rule-trigger-type"><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="project_status_change">Project status changes</SelectItem>
                      <SelectItem value="opportunity_status_change">Opportunity status changes</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="triggerStatus" render={({ field }) => (
                  <FormItem>
                    <FormLabel>When status changes to *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-rule-trigger-status"><SelectValue placeholder="Pick a status" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {statusOptions.map(s => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="assignedToUserId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assign to *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-rule-assignee"><SelectValue placeholder="Pick a person" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {users.map(u => (
                          <SelectItem key={u.id} value={u.id}>{userDisplayName(u)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="rounded-lg border border-border p-3 space-y-4">
                <FormField control={form.control} name="createTodo" render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-2 space-y-0">
                    <div>
                      <FormLabel>Create a todo</FormLabel>
                      <FormDescription className="text-xs">It appears in their My Work list.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-rule-create-todo" />
                    </FormControl>
                  </FormItem>
                )} />

                {watchCreateTodo && (
                  <>
                    <FormField control={form.control} name="todoTitle" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Todo title *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Complete takeoff" {...field} data-testid="input-rule-todo-title" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="todoDescription" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Todo description</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Extra instructions (optional)" rows={2} {...field} data-testid="input-rule-todo-description" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="todoPriority" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-rule-priority"><SelectValue /></SelectTrigger>
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

                    <FormField control={form.control} name="dueOffsetType" render={({ field }) => (
                      <FormItem>
                        <FormLabel>When is it due?</FormLabel>
                        <FormControl>
                          <RadioGroup onValueChange={field.onChange} value={field.value} className="space-y-2">
                            <div className="flex items-center gap-2">
                              <RadioGroupItem value="immediately" id="due-immediately" />
                              <Label htmlFor="due-immediately" className="font-normal cursor-pointer">Same day the status changes</Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <RadioGroupItem value="days" id="due-days" />
                              <Label htmlFor="due-days" className="font-normal cursor-pointer flex items-center gap-2">
                                Within
                                <FormField control={form.control} name="dueOffsetDays" render={({ field: daysField }) => (
                                  <Input
                                    type="number" min="0" step="1"
                                    className="w-16 h-8 inline-block"
                                    {...daysField}
                                    onClick={(e) => { e.preventDefault(); form.setValue("dueOffsetType", "days"); }}
                                    data-testid="input-rule-due-days"
                                  />
                                )} />
                                days
                              </Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <RadioGroupItem value="none" id="due-none" />
                              <Label htmlFor="due-none" className="font-normal cursor-pointer">No due date</Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        {watchDueOffsetType === "days" && <FormField control={form.control} name="dueOffsetDays" render={() => <FormMessage />} />}
                      </FormItem>
                    )} />
                  </>
                )}
              </div>

              <div className="rounded-lg border border-border p-3 space-y-3">
                <p className="text-sm font-medium">How should they find out?</p>
                <FormField control={form.control} name="sendInAppNotification" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid="checkbox-rule-in-app" />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer">Notification in the app (bell icon)</FormLabel>
                  </FormItem>
                )} />
                <FormField control={form.control} name="sendEmailNotification" render={({ field }) => (
                  <FormItem className="flex items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} data-testid="checkbox-rule-email" />
                    </FormControl>
                    <FormLabel className="font-normal cursor-pointer">Also send an email</FormLabel>
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="isActive" render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-2 space-y-0">
                  <div>
                    <FormLabel>Rule is on</FormLabel>
                    <FormDescription className="text-xs">Turn off to pause without deleting.</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-rule-is-active" />
                  </FormControl>
                </FormItem>
              )} />

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)} className="min-h-[44px]" data-testid="button-rule-cancel">
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending} className="min-h-[44px]" data-testid="button-rule-save">
                  {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {editingRule ? "Save Changes" : "Create Rule"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deletingRule} onOpenChange={(open) => !open && setDeletingRule(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingRule?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The rule will stop running. Todos it already created are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingRule && deleteRule.mutate(deletingRule.id, {
                onSuccess: () => { toast({ title: "Rule deleted" }); setDeletingRule(null); },
                onError: (err) => toast({ title: "Couldn't delete rule", description: extractApiError(err, "Please try again."), variant: "destructive" }),
              })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
