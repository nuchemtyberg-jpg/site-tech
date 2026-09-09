import { useState } from "react";
import { ArrowDown, ArrowUp, Clock, FileText, Loader2, Pencil, Plus } from "lucide-react";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateDocumentCategory,
  useDocumentCategories,
  useDocumentCategoryHistory,
  useReorderDocumentCategories,
  useUpdateDocumentCategory,
} from "@/hooks/use-document-categories";

export function DocumentCategoriesSettings() {
  const { data: categories = [], isLoading } = useDocumentCategories();
  const { data: history = [], isLoading: isHistoryLoading } = useDocumentCategoryHistory();
  const create = useCreateDocumentCategory();
  const update = useUpdateDocumentCategory();
  const reorder = useReorderDocumentCategories();
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  const onError = (error: Error) => toast({
    title: "Couldn't update document categories",
    description: error.message,
    variant: "destructive",
  });

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const ordered = [...categories];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    reorder.mutate(ordered.map(category => category.id), { onError });
  };

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    create.mutate(name, {
      onSuccess: () => {
        setNewName("");
        toast({ title: "Document category added" });
      },
      onError,
    });
  };

  const saveName = (id: number) => {
    const name = editingName.trim();
    if (!name) return;
    update.mutate({ id, name }, {
      onSuccess: () => {
        setEditingId(null);
        toast({ title: "Document category renamed" });
      },
      onError,
    });
  };

  return (
    <Card data-testid="card-document-categories">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Document Categories
        </CardTitle>
        <CardDescription>
          Choose the categories available for opportunity documents. Inactive categories remain visible on existing documents.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading categories...
          </div>
        ) : (
          <div className="space-y-2">
            {categories.map((category, index) => (
              <div key={category.id} className="flex items-center gap-2 rounded-md border p-2" data-testid={`document-category-${category.id}`}>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="min-h-10 min-w-10" disabled={index === 0 || reorder.isPending} onClick={() => move(index, -1)} aria-label={`Move ${category.name} up`}>
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="min-h-10 min-w-10" disabled={index === categories.length - 1 || reorder.isPending} onClick={() => move(index, 1)} aria-label={`Move ${category.name} down`}>
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                </div>
                {editingId === category.id ? (
                  <form className="flex flex-1 gap-2" onSubmit={event => { event.preventDefault(); saveName(category.id); }}>
                    <Input value={editingName} onChange={event => setEditingName(event.target.value)} autoFocus maxLength={100} />
                    <Button type="submit" disabled={!editingName.trim() || update.isPending}>Save</Button>
                    <Button type="button" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                  </form>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{category.name}</p>
                      {!category.isActive && <Badge variant="secondary" className="mt-1">Inactive</Badge>}
                    </div>
                    <Button variant="ghost" size="icon" className="min-h-10 min-w-10" onClick={() => { setEditingId(category.id); setEditingName(category.name); }} aria-label={`Rename ${category.name}`}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Switch
                      checked={category.isActive}
                      disabled={update.isPending}
                      onCheckedChange={isActive => update.mutate({ id: category.id, isActive }, {
                        onSuccess: () => toast({ title: isActive ? "Category activated" : "Category deactivated" }),
                        onError,
                      })}
                      aria-label={`${category.isActive ? "Deactivate" : "Activate"} ${category.name}`}
                    />
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <form className="flex gap-2 border-t pt-4" onSubmit={event => { event.preventDefault(); add(); }}>
          <Input value={newName} onChange={event => setNewName(event.target.value)} placeholder="New category name" maxLength={100} />
          <Button type="submit" disabled={!newName.trim() || create.isPending}>
            {create.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            Add
          </Button>
        </form>
        <div className="space-y-3 border-t pt-4" data-testid="document-category-history">
          <div>
            <h3 className="flex items-center gap-2 font-medium">
              <Clock className="h-4 w-4" />
              Change history
            </h3>
            <p className="text-sm text-muted-foreground">Recent changes made by administrators.</p>
          </div>
          {isHistoryLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading history...
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No category changes have been recorded yet.</p>
          ) : (
            <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
              {history.map(entry => (
                <div key={entry.id} className="border-l-2 pl-3 text-sm">
                  <p>{entry.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.actorName}
                    {entry.createdAt ? ` · ${format(new Date(entry.createdAt), "MMM d, yyyy 'at' h:mm a")}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}