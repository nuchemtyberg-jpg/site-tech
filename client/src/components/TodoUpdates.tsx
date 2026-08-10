import { useState } from "react";
import { format } from "date-fns";
import { Loader2, MessageSquare, MoreVertical, Pencil, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  useTodoUpdates, useAddTodoUpdate, useEditTodoUpdate, useDeleteTodoUpdate, extractApiError,
} from "@/hooks/use-todos";
import type { TodoUpdateWithAuthor } from "@shared/schema";

const PAGE_SIZE = 25;

// Chronological notes / progress timeline on a todo (newest first).
// Updates are separate from the description: the description says what needs
// to be done; updates record what happened along the way.
export function TodoUpdates({ todoId }: { todoId: number }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { data, isLoading } = useTodoUpdates(todoId, limit);
  const addUpdate = useAddTodoUpdate(todoId);
  const [draft, setDraft] = useState("");

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const submit = () => {
    const body = draft.trim();
    if (!body || addUpdate.isPending) return;
    addUpdate.mutate(body, {
      onSuccess: () => setDraft(""),
      onError: (err) => toast({ title: "Couldn't add update", description: extractApiError(err, "Please try again."), variant: "destructive" }),
    });
  };

  return (
    <div className="border-t border-border pt-4 space-y-3" data-testid="todo-updates-section">
      <p className="text-sm font-semibold flex items-center gap-1.5">
        <MessageSquare className="w-4 h-4 text-muted-foreground" />
        Updates{total > 0 ? ` (${total})` : ""}
      </p>

      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add an update… progress, calls made, blockers"
          rows={2}
          maxLength={5000}
          className="text-sm"
          data-testid="input-todo-update"
        />
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={!draft.trim() || addUpdate.isPending}
            className="min-h-[40px]"
            data-testid="button-add-update"
          >
            {addUpdate.isPending
              ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              : <Send className="w-3.5 h-3.5 mr-1.5" />}
            Add Update
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground text-center py-3">Loading updates…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3" data-testid="text-no-updates">No updates yet.</p>
      ) : (
        <div className="space-y-2.5">
          {items.map((u) => (
            <UpdateEntry
              key={u.id}
              update={u}
              todoId={todoId}
              isAuthor={u.createdByUserId === user?.id}
              isAdmin={user?.role === "admin"}
            />
          ))}
          {items.length < total && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full min-h-[40px] text-xs text-muted-foreground"
              onClick={() => setLimit((l) => l + PAGE_SIZE)}
              data-testid="button-show-older-updates"
            >
              Show older updates ({total - items.length} more)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function UpdateEntry({ update, todoId, isAuthor, isAdmin }: {
  update: TodoUpdateWithAuthor;
  todoId: number;
  isAuthor: boolean;
  isAdmin: boolean;
}) {
  const { toast } = useToast();
  const editUpdate = useEditTodoUpdate(todoId);
  const deleteUpdate = useDeleteTodoUpdate(todoId);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(update.body);

  // Authors manage their own updates; admins can moderate any. Others: read-only.
  const canModify = isAuthor || isAdmin;

  const saveEdit = () => {
    const body = editDraft.trim();
    if (!body || editUpdate.isPending) return;
    editUpdate.mutate({ id: update.id, body }, {
      onSuccess: () => setEditing(false),
      onError: (err) => toast({ title: "Couldn't save update", description: extractApiError(err, "Please try again."), variant: "destructive" }),
    });
  };

  return (
    <div className="rounded-lg bg-muted/50 p-3" data-testid={`todo-update-${update.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold break-words">{update.authorName || "Unknown"}</p>
          <p className="text-[10px] text-muted-foreground">
            {update.createdAt ? format(new Date(update.createdAt as unknown as string), "MMM d, yyyy · h:mm a") : ""}
            {update.editedAt && <span className="italic"> · Edited</span>}
          </p>
        </div>
        {canModify && !editing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 -mt-1 -mr-1" data-testid={`button-update-menu-${update.id}`}>
                <MoreVertical className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setEditDraft(update.body); setEditing(true); }} className="min-h-[40px]">
                <Pencil className="w-4 h-4 mr-2" />Edit
              </DropdownMenuItem>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="min-h-[40px] text-destructive focus:text-destructive">
                    <Trash2 className="w-4 h-4 mr-2" />Remove
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove this update?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The update will no longer appear in the timeline.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => deleteUpdate.mutate(update.id, {
                        onError: (err) => toast({ title: "Couldn't remove update", description: extractApiError(err, "Please try again."), variant: "destructive" }),
                      })}
                    >
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            rows={3}
            maxLength={5000}
            className="text-sm"
            data-testid={`input-edit-update-${update.id}`}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" className="min-h-[36px]" onClick={() => { setEditing(false); setEditDraft(update.body); }}>
              Cancel
            </Button>
            <Button type="button" size="sm" className="min-h-[36px]" onClick={saveEdit} disabled={!editDraft.trim() || editUpdate.isPending} data-testid={`button-save-update-${update.id}`}>
              {editUpdate.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm mt-1.5 whitespace-pre-wrap break-words" data-testid={`text-update-body-${update.id}`}>{update.body}</p>
      )}
    </div>
  );
}
