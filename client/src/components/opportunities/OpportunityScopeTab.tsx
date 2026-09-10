import { useState } from "react";
import { ChevronDown, ChevronRight, CircleDot, Loader2, ListChecks, Plus, Trash2, X, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useAddScopeItem, useCreateScopeClarificationTodo,
  useDeleteScopeItem, useOpportunityScope, useReorderScopeItems, useUpdateScopeItem,
} from "@/hooks/use-opportunity-scope";
import { useAppUsers, userDisplayName } from "@/hooks/use-todos";
import { useToast } from "@/hooks/use-toast";
import { extractApiError } from "@/hooks/use-todos";
import {
  SCOPE_ITEM_STATUS_LABELS, SCOPE_ITEM_STATUS_VALUES, SCOPE_READINESS_LABELS,
  summarizeScopeItems, type ScopeItemStatus, type ScopeReadiness,
} from "@shared/scopeChecklist";
import type { OpportunityScopeItemWithDetails } from "@shared/schema";

const STATUS_BADGE_CLASS: Record<ScopeItemStatus, string> = {
  not_reviewed: "bg-muted text-muted-foreground",
  included: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  excluded: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  needs_clarification: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};

export const READINESS_BADGE_CLASS: Record<ScopeReadiness, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  ready_for_takeoff: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

export function ReadinessBadge({ readiness }: { readiness: ScopeReadiness }) {
  return <Badge variant="outline" className={`${READINESS_BADGE_CLASS[readiness]} border-0`}>{SCOPE_READINESS_LABELS[readiness]}</Badge>;
}

export default function OpportunityScopeTab({ opportunityId }: { opportunityId: number }) {
  const { data, isLoading, isError, error, refetch, isFetching } = useOpportunityScope(opportunityId);
  const reorder = useReorderScopeItems(opportunityId);
  const [addingCategory, setAddingCategory] = useState<string | null>(null);

  if (isLoading) return <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
  if (isError) return (
    <Card data-testid="scope-error-state">
      <CardContent className="p-6 text-center space-y-3">
        <p className="font-medium text-destructive">Unable to load this Opportunity's scope checklist.</p>
        <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : "Please try again."}</p>
        <Button variant="outline" disabled={isFetching} onClick={() => refetch()}>
          {isFetching && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Retry
        </Button>
      </CardContent>
    </Card>
  );
  const items = data?.items || [];
  const categories = data?.categories || [];
  const readiness = data?.readiness || "not_started";
  const summary = summarizeScopeItems(items);

  // Group by every known category (not just categories that currently have
  // items) so custom items can be added to an untouched category and the
  // section doesn't disappear when its last item is removed.
  const itemsByCategory = new Map<string, OpportunityScopeItemWithDetails[]>();
  for (const item of items) {
    if (!itemsByCategory.has(item.categoryKey)) itemsByCategory.set(item.categoryKey, []);
    itemsByCategory.get(item.categoryKey)!.push(item);
  }

  const moveItem = (categoryKey: string, itemId: number, direction: -1 | 1) => {
    const catItems = itemsByCategory.get(categoryKey) || [];
    const idx = catItems.findIndex(i => i.id === itemId);
    const swapWith = idx + direction;
    if (idx < 0 || swapWith < 0 || swapWith >= catItems.length) return;
    const reordered = [...catItems];
    [reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]];
    reorder.mutate(reordered.map(i => i.id));
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <ListChecks className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="font-semibold">{summary.total} Scope Item{summary.total === 1 ? "" : "s"}</span>
            {summary.total > 0 && <>
              <span className="text-muted-foreground">·</span>
              <span>{summary.included} Included</span>
              <span className="text-muted-foreground">·</span>
              <span>{summary.excluded} Excluded</span>
              <span className="text-muted-foreground">·</span>
              <span>{summary.needsClarification} Needs Clarification</span>
            </>}
            <ReadinessBadge readiness={readiness} />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {categories.map(category => {
          const catItems = itemsByCategory.get(category.key) || [];
          return (
            <div key={category.key} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">{category.name}{catItems.length > 0 ? ` (${catItems.length})` : ""}</h3>
              <div className="space-y-2">
                {catItems.map((item, idx) => (
                  <ScopeItemRow
                    key={item.id}
                    item={item}
                    opportunityId={opportunityId}
                    canMoveUp={idx > 0}
                    canMoveDown={idx < catItems.length - 1}
                    onMove={dir => moveItem(category.key, item.id, dir)}
                  />
                ))}
              </div>
              {addingCategory === category.key ? (
                <AddCustomItemForm categoryKey={category.key} opportunityId={opportunityId} onDone={() => setAddingCategory(null)} />
              ) : (
                <Button className="min-h-11" variant="ghost" size="sm" onClick={() => setAddingCategory(category.key)} data-testid={`button-add-scope-item-${category.key}`}>
                  <Plus className="w-4 h-4 mr-1" />Add custom item
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddCustomItemForm({ categoryKey, opportunityId, onDone }: { categoryKey: string; opportunityId: number; onDone: () => void }) {
  const [name, setName] = useState("");
  const add = useAddScopeItem(opportunityId);
  const { toast } = useToast();
  const submit = () => {
    if (!name.trim()) return;
    add.mutate({ categoryKey, name: name.trim() }, {
      onSuccess: () => { setName(""); onDone(); },
      onError: e => toast({ title: "Couldn't add item", description: extractApiError(e, "Try again."), variant: "destructive" }),
    });
  };
  return (
    <div className="flex flex-col gap-2 border rounded-md p-3">
      <div>
        <Label className="text-xs">Item name *</Label>
        <Input
          className="min-h-11"
          placeholder="e.g. Retaining wall drainage"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
          data-testid={`input-custom-scope-item-name-${categoryKey}`}
        />
      </div>
      <div className="flex gap-2 shrink-0">
        <Button className="min-h-11" disabled={!name.trim() || add.isPending} onClick={submit}>{add.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Add</Button>
        <Button className="min-h-11" variant="ghost" onClick={onDone}><X className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}

function ScopeItemRow({ item, opportunityId, canMoveUp, canMoveDown, onMove }: {
  item: OpportunityScopeItemWithDetails; opportunityId: number;
  canMoveUp: boolean; canMoveDown: boolean; onMove: (dir: -1 | 1) => void;
}) {
  const update = useUpdateScopeItem(opportunityId);
  const remove = useDeleteScopeItem(opportunityId);
  const { toast } = useToast();
  const [notesOpen, setNotesOpen] = useState(Boolean(item.notes));
  const [notes, setNotes] = useState(item.notes || "");
  const [todoOpen, setTodoOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const status = item.status as ScopeItemStatus;

  const setStatus = (next: string) => {
    update.mutate({ itemId: item.id, status: next }, {
      onSuccess: () => { if (next === "needs_clarification") setTodoOpen(true); },
      onError: e => toast({ title: "Couldn't update status", description: extractApiError(e, "Try again."), variant: "destructive" }),
    });
  };

  const saveNotes = () => {
    if ((notes || "") === (item.notes || "")) return;
    update.mutate({ itemId: item.id, notes: notes || null }, {
      onSuccess: () => toast({ title: "Scope item notes saved" }),
      onError: e => toast({ title: "Couldn't save notes", description: extractApiError(e, "Try again."), variant: "destructive" }),
    });
  };

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 flex items-start gap-1">
            <div className="flex flex-col -my-1 shrink-0">
              <button
                className="min-h-9 min-w-9 flex items-center justify-center disabled:opacity-30 text-muted-foreground hover:text-foreground"
                disabled={!canMoveUp}
                onClick={() => onMove(-1)}
                aria-label="Move up"
                data-testid={`button-move-up-${item.id}`}
              ><ArrowUp className="w-3.5 h-3.5" /></button>
              <button
                className="min-h-9 min-w-9 flex items-center justify-center disabled:opacity-30 text-muted-foreground hover:text-foreground"
                disabled={!canMoveDown}
                onClick={() => onMove(1)}
                aria-label="Move down"
                data-testid={`button-move-down-${item.id}`}
              ><ArrowDown className="w-3.5 h-3.5" /></button>
            </div>
            <div className="pt-1.5 min-w-0">
              <p className="font-medium break-words flex items-center gap-2 flex-wrap">
                {item.name}
                {item.isCustom && <Badge variant="outline" className="text-xs">Custom</Badge>}
              </p>
            </div>
          </div>
          <div className="shrink-0">
            <div className="flex gap-1 mb-1">
              <Button size="sm" variant={status === "included" ? "default" : "outline"} onClick={() => setStatus("included")} disabled={update.isPending} data-testid={`button-include-scope-item-${item.id}`}>Included</Button>
              <Button size="sm" variant={status === "excluded" ? "secondary" : "outline"} onClick={() => setStatus("excluded")} disabled={update.isPending} data-testid={`button-exclude-scope-item-${item.id}`}>Excluded</Button>
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className={`min-h-11 w-full sm:w-52 ${STATUS_BADGE_CLASS[status]} border-0`} data-testid={`select-scope-status-${item.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPE_ITEM_STATUS_VALUES.map(s => <SelectItem key={s} value={s}>{SCOPE_ITEM_STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <button className="min-h-11 inline-flex items-center hover:text-foreground" onClick={() => setNotesOpen(v => !v)} data-testid={`button-toggle-notes-${item.id}`}>
            {notesOpen ? <ChevronDown className="w-3.5 h-3.5 mr-1" /> : <ChevronRight className="w-3.5 h-3.5 mr-1" />}
            {item.notes ? "Notes" : "Add notes"}
          </button>
          {status === "needs_clarification" && !item.linkedTodoId && (
            <button className="min-h-11 inline-flex items-center text-amber-700 hover:underline" onClick={() => setTodoOpen(true)} data-testid={`button-create-clarification-todo-${item.id}`}>
              <CircleDot className="w-3.5 h-3.5 mr-1" />Create Todo
            </button>
          )}
          {status === "needs_clarification" && item.linkedTodoId && (
            <span className="inline-flex items-center text-muted-foreground"><CircleDot className="w-3.5 h-3.5 mr-1" />Todo created</span>
          )}
          <button className="min-h-11 inline-flex items-center hover:text-destructive ml-auto" onClick={() => setConfirmRemove(true)} data-testid={`button-remove-scope-item-${item.id}`}>
            <Trash2 className="w-3.5 h-3.5 mr-1" />Remove
          </button>
        </div>

        {notesOpen && (
          <div className="space-y-2">
            <Textarea
              className="text-sm"
              placeholder="Opportunity-specific notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              data-testid={`textarea-scope-notes-${item.id}`}
            />
            <Button size="sm" disabled={update.isPending || notes === (item.notes || "")} onClick={saveNotes} data-testid={`button-save-scope-notes-${item.id}`}>Save notes</Button>
          </div>
        )}

        {todoOpen && <CreateClarificationTodo item={item} opportunityId={opportunityId} onDone={() => setTodoOpen(false)} />}
        <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove {item.name}?</AlertDialogTitle><AlertDialogDescription>This removes the item from this Opportunity only. Catalog items will remain available for future Opportunities.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={event => { event.preventDefault(); remove.mutate(item.id, { onSuccess: () => setConfirmRemove(false), onError: e => toast({ title: "Couldn't remove item", description: extractApiError(e, "Try again."), variant: "destructive" }) }); }}>Remove item</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

function CreateClarificationTodo({ item, opportunityId, onDone }: { item: OpportunityScopeItemWithDetails; opportunityId: number; onDone: () => void }) {
  const { data: users = [] } = useAppUsers();
  const create = useCreateScopeClarificationTodo(opportunityId);
  const { toast } = useToast();
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");

  if (item.linkedTodoId) return null;

  return (
    <div className="border rounded-md p-3 space-y-2 bg-muted/30">
      <p className="text-xs font-medium">Create a Todo for this clarification</p>
      <div className="grid sm:grid-cols-[1fr_auto_auto] gap-2">
        <div>
          <Label className="text-xs">Assign to *</Label>
          <Select value={assignee} onValueChange={setAssignee}>
            <SelectTrigger className="min-h-11"><SelectValue placeholder="Choose user" /></SelectTrigger>
            <SelectContent>{users.map(u => <SelectItem key={u.id} value={u.id}>{userDisplayName(u)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Due date</Label>
          <Input className="min-h-11" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
        <div className="flex items-end gap-2">
          <Button
            className="min-h-11"
            disabled={!assignee || create.isPending}
            onClick={() => create.mutate({ itemId: item.id, assignedToUserId: assignee, dueDate: dueDate || null }, {
              onSuccess: () => { toast({ title: "Todo created" }); onDone(); },
              onError: e => toast({ title: "Couldn't create todo", description: extractApiError(e, "Try again."), variant: "destructive" }),
            })}
          >
            {create.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Create
          </Button>
          <Button className="min-h-11" variant="ghost" onClick={onDone}><X className="w-4 h-4" /></Button>
        </div>
      </div>
    </div>
  );
}
