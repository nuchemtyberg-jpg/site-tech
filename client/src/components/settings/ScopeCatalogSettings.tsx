import { useState } from "react";
import { ArrowDown, ArrowUp, ListChecks, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateScopeCatalogItem, useCreateScopeCategory, useReorderScopeCatalogItems,
  useReorderScopeCategories, useScopeCatalog, useUpdateScopeCatalogItem, useUpdateScopeCategory,
} from "@/hooks/use-scope-catalog";

export function ScopeCatalogSettings() {
  const { data, isLoading, isError, error } = useScopeCatalog();
  const createCategory = useCreateScopeCategory();
  const updateCategory = useUpdateScopeCategory();
  const reorderCategories = useReorderScopeCategories();
  const createItem = useCreateScopeCatalogItem();
  const updateItem = useUpdateScopeCatalogItem();
  const reorderItems = useReorderScopeCatalogItems();
  const { toast } = useToast();
  const [newCategory, setNewCategory] = useState("");
  const [newItems, setNewItems] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<{ type: "category" | "item"; id: number; name: string } | null>(null);
  const [deactivate, setDeactivate] = useState<{ type: "category" | "item"; id: number; name: string } | null>(null);
  const categories = data?.categories || [];
  const items = data?.items || [];
  const fail = (e: Error) => toast({ title: "Couldn't update scope catalog", description: e.message, variant: "destructive" });
  const success = (title: string) => toast({ title });

  const moveCategory = (index: number, direction: -1 | 1) => {
    const next = [...categories];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorderCategories.mutate(next.map(value => value.id), { onSuccess: () => success("Category order saved"), onError: fail });
  };
  const moveItem = (categoryId: number, index: number, direction: -1 | 1) => {
    const current = items.filter(value => value.categoryId === categoryId);
    const target = index + direction;
    if (target < 0 || target >= current.length) return;
    [current[index], current[target]] = [current[target], current[index]];
    reorderItems.mutate({ categoryId, orderedIds: current.map(value => value.id) }, { onSuccess: () => success("Item order saved"), onError: fail });
  };
  const saveEdit = () => {
    if (!editing?.name.trim()) return;
    const options = {
      onSuccess: () => { setEditing(null); success("Scope catalog updated"); },
      onError: fail,
    };
    if (editing.type === "category") updateCategory.mutate({ id: editing.id, name: editing.name.trim() }, options);
    else updateItem.mutate({ id: editing.id, name: editing.name.trim() }, options);
  };
  const confirmDeactivate = () => {
    if (!deactivate) return;
    const options = {
      onSuccess: () => { setDeactivate(null); success(`${deactivate.type === "category" ? "Category" : "Item"} deactivated`); },
      onError: fail,
    };
    if (deactivate.type === "category") updateCategory.mutate({ id: deactivate.id, isActive: false }, options);
    else updateItem.mutate({ id: deactivate.id, isActive: false }, options);
  };

  return (
    <Card className="md:col-span-2" data-testid="card-scope-catalog">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5" />Bidding Scope Catalog</CardTitle>
        <CardDescription>Configure the checklist automatically added to new Opportunities. Inactive entries remain on existing Opportunities.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading scope catalog...</p>
          : isError ? <p className="text-sm text-destructive">Unable to load scope catalog: {(error as Error).message}</p>
          : categories.length === 0 ? <p className="text-sm text-muted-foreground">No scope categories yet. Add one below.</p>
          : categories.map((category, categoryIndex) => {
            const categoryItems = items.filter(value => value.categoryId === category.id);
            return <section key={category.id} className="rounded-md border p-3 space-y-3" data-testid={`scope-category-${category.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Button className="min-h-11 min-w-11" size="icon" variant="ghost" disabled={categoryIndex === 0 || reorderCategories.isPending} onClick={() => moveCategory(categoryIndex, -1)} aria-label={`Move ${category.name} up`}><ArrowUp className="h-4 w-4" /></Button>
                <Button className="min-h-11 min-w-11" size="icon" variant="ghost" disabled={categoryIndex === categories.length - 1 || reorderCategories.isPending} onClick={() => moveCategory(categoryIndex, 1)} aria-label={`Move ${category.name} down`}><ArrowDown className="h-4 w-4" /></Button>
                {editing?.type === "category" && editing.id === category.id
                  ? <form className="order-first flex basis-full flex-wrap gap-2 sm:order-none sm:min-w-0 sm:flex-1 sm:flex-nowrap" onSubmit={e => { e.preventDefault(); saveEdit(); }}>
                      <Input className="min-w-0 basis-full sm:basis-auto" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} aria-label={`Category name for ${category.name}`} />
                      <Button className="min-h-11" type="submit">Save</Button>
                    </form>
                  : <>
                      <h3 className="order-first min-w-0 basis-full break-words font-semibold sm:order-none sm:flex-1 sm:basis-auto">{category.name} {!category.isActive && <Badge variant="secondary">Inactive</Badge>}</h3>
                      <Button className="min-h-11 min-w-11" size="icon" variant="ghost" onClick={() => setEditing({ type: "category", id: category.id, name: category.name })} aria-label={`Rename ${category.name}`}><Pencil className="h-4 w-4" /></Button>
                      {category.isActive
                        ? <Button className="min-h-11 min-w-11" size="icon" variant="ghost" onClick={() => setDeactivate({ type: "category", id: category.id, name: category.name })} aria-label={`Deactivate ${category.name}`}><Trash2 className="h-4 w-4" /></Button>
                        : <Button className="min-h-11" size="sm" variant="outline" onClick={() => updateCategory.mutate({ id: category.id, isActive: true }, { onSuccess: () => success("Category activated"), onError: fail })}>Activate</Button>}
                    </>}
              </div>
              {categoryItems.length === 0 ? <p className="text-sm text-muted-foreground">No items in this category.</p> : categoryItems.map((item, index) =>
                <div key={item.id} className="flex flex-wrap items-center gap-2 border-t pt-2" data-testid={`scope-catalog-item-${item.id}`}>
                  <Button className="min-h-11 min-w-11" size="icon" variant="ghost" disabled={index === 0 || reorderItems.isPending} onClick={() => moveItem(category.id, index, -1)} aria-label={`Move ${item.name} up`}><ArrowUp className="h-4 w-4" /></Button>
                  <Button className="min-h-11 min-w-11" size="icon" variant="ghost" disabled={index === categoryItems.length - 1 || reorderItems.isPending} onClick={() => moveItem(category.id, index, 1)} aria-label={`Move ${item.name} down`}><ArrowDown className="h-4 w-4" /></Button>
                  {editing?.type === "item" && editing.id === item.id
                    ? <form className="order-first flex basis-full flex-wrap gap-2 sm:order-none sm:min-w-0 sm:flex-1 sm:flex-nowrap" onSubmit={e => { e.preventDefault(); saveEdit(); }}>
                        <Input className="min-w-0 basis-full sm:basis-auto" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} aria-label={`Scope item name for ${item.name}`} />
                        <Button className="min-h-11" type="submit">Save</Button>
                      </form>
                    : <>
                        <span className="order-first min-w-0 basis-full break-words text-sm sm:order-none sm:flex-1 sm:basis-auto">{item.name} {!item.isActive && <Badge variant="secondary">Inactive</Badge>}</span>
                        <Button className="min-h-11 min-w-11" size="icon" variant="ghost" onClick={() => setEditing({ type: "item", id: item.id, name: item.name })} aria-label={`Rename ${item.name}`}><Pencil className="h-4 w-4" /></Button>
                        {item.isActive
                          ? <Button className="min-h-11 min-w-11" size="icon" variant="ghost" onClick={() => setDeactivate({ type: "item", id: item.id, name: item.name })} aria-label={`Deactivate ${item.name}`}><Trash2 className="h-4 w-4" /></Button>
                          : <Button className="min-h-11" size="sm" variant="outline" onClick={() => updateItem.mutate({ id: item.id, isActive: true }, { onSuccess: () => success("Item activated"), onError: fail })}>Activate</Button>}
                      </>}
                </div>)}
              {category.isActive && <form className="flex flex-wrap gap-2 border-t pt-3" onSubmit={e => { e.preventDefault(); const name = (newItems[category.id] || "").trim(); if (!name) return; createItem.mutate({ categoryId: category.id, name }, { onSuccess: () => { setNewItems(v => ({ ...v, [category.id]: "" })); success("Scope item added"); }, onError: fail }); }}>
                <Input className="min-w-0 basis-full sm:flex-1 sm:basis-auto" placeholder="New scope item" value={newItems[category.id] || ""} onChange={e => setNewItems(v => ({ ...v, [category.id]: e.target.value }))} aria-label={`New scope item in ${category.name}`} />
                <Button className="min-h-11" type="submit" disabled={!newItems[category.id]?.trim() || createItem.isPending}><Plus className="h-4 w-4 mr-1" />Add item</Button>
              </form>}
            </section>;
          })}
        <form className="flex flex-wrap gap-2 border-t pt-4" onSubmit={e => { e.preventDefault(); if (!newCategory.trim()) return; createCategory.mutate(newCategory.trim(), { onSuccess: () => { setNewCategory(""); success("Scope category added"); }, onError: fail }); }}>
          <Input className="min-w-0 basis-full sm:flex-1 sm:basis-auto" placeholder="New category name" value={newCategory} onChange={e => setNewCategory(e.target.value)} aria-label="New scope category name" />
          <Button className="min-h-11" type="submit" disabled={!newCategory.trim() || createCategory.isPending}><Plus className="h-4 w-4 mr-1" />Add category</Button>
        </form>
        <AlertDialog open={deactivate !== null} onOpenChange={open => { if (!open) setDeactivate(null); }}>
          <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Deactivate {deactivate?.name}?</AlertDialogTitle><AlertDialogDescription>It will no longer be added to future Opportunities. Existing Opportunity scope items are preserved.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={e => { e.preventDefault(); confirmDeactivate(); }}>Deactivate</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}