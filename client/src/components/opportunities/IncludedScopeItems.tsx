import type { OpportunityScopeItemWithDetails } from "@shared/schema";

export function IncludedScopeItems({ items }: { items: OpportunityScopeItemWithDetails[] }) {
  const included = items.filter(item => item.status === "included");
  return (
    <section data-testid="included-scope-items">
      <p className="text-xs text-muted-foreground mb-1">Included scope items</p>
      {included.length > 0 ? (
        <ul className="list-disc pl-5 space-y-1">
          {included.map(item => <li key={item.id}>{item.name}{item.notes ? <span className="text-muted-foreground"> — {item.notes}</span> : null}</li>)}
        </ul>
      ) : <p className="text-muted-foreground">No scope items marked Included yet.</p>}
    </section>
  );
}