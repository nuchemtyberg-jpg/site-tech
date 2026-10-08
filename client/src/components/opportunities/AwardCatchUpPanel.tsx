import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, Loader2, RefreshCw, Wrench } from "lucide-react";
import { Link } from "wouter";
import { useAwardCatchUp, useRunAwardCatchUp, type AwardCatchUpResult } from "@/hooks/use-project-bids";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

const actionLabel = (action: string) => ({ linked: "Already linked", create: "Create project", add_contract: "Add contract", conflict: "Conflict" }[action] || action);
export function AwardCatchUpPanel() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [results, setResults] = useState<AwardCatchUpResult[]>([]);
  const query = useAwardCatchUp();
  const run = useRunAwardCatchUp();
  const { toast } = useToast();
  const rows = query.data ?? [];
  const toggle = (id: number) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const approve = () => {
    if (!selected.length) return;
    const count = selected.length;
    if (!window.confirm(`Confirm repair for ${count} selected awarded bid${count === 1 ? "" : "s"}? This will create or link project contracts.`)) return;
    run.mutate(selected, {
      onSuccess: response => {
        const runResults = Array.isArray(response?.results) ? response.results : [];
        setResults(runResults);
        setSelected([]);
        const succeeded = runResults.filter(result => result.success).length;
        const failed = runResults.length - succeeded;
        toast({
          title: failed ? "Some award records need attention" : "Award records processed",
          description: `${succeeded} repaired · ${failed} failed`,
          ...(failed ? { variant: "destructive" as const } : {}),
        });
      },
      onError: error => toast({ title: "Couldn’t process award records", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" }),
    });
  };
  return <Card className="border-amber-700/20 bg-amber-500/[0.035]" data-testid="award-catch-up">
    <CardContent className="p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3"><div className="rounded-lg bg-amber-500/10 p-2 text-amber-800 dark:text-amber-300"><Wrench className="h-4 w-4" /></div><div><p className="font-semibold">Award record reconciliation</p><p className="text-sm text-muted-foreground mt-0.5">Review legacy awards before creating or linking project contracts.</p></div></div>
        <div className="flex gap-2"><Button variant="outline" className="min-h-11" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 mr-2 ${query.isFetching ? "animate-spin" : ""}`} />Refresh</Button><Button variant="outline" className="min-h-11" onClick={() => setOpen(!open)}>{open ? "Hide preview" : "Review records"}<ChevronDown className={`h-4 w-4 ml-2 transition-transform ${open ? "rotate-180" : ""}`} /></Button></div>
      </div>
      {open && <div className="mt-4 border-t pt-4">
        {query.isLoading ? <div className="space-y-2">{[1, 2, 3].map(i => <div className="h-12 rounded bg-muted animate-pulse" key={i} />)}</div>
          : query.isError ? <div className="py-6 text-center"><p className="text-sm">Couldn’t load the reconciliation preview.</p><Button variant="outline" className="mt-3" onClick={() => query.refetch()}>Retry</Button></div>
          : !rows.length ? <div className="py-7 text-center text-sm text-muted-foreground"><Check className="mx-auto h-6 w-6 text-primary mb-2" />No legacy award records need attention.</div>
          : <><div className="space-y-2">{rows.map(row => {
            const disabled = row.action === "conflict" || row.action === "linked";
            const checked = selected.includes(row.id);
            return <label key={row.id} className={`flex items-start gap-3 rounded-lg border p-3 ${disabled ? "opacity-70 bg-muted/30" : "cursor-pointer hover:border-primary/40"} ${checked ? "border-primary bg-primary/[0.035]" : ""}`}>
              <Checkbox className="mt-0.5" disabled={disabled || run.isPending} checked={checked} onCheckedChange={() => toggle(row.id)} aria-label={`Select ${row.opportunityNumber}`} />
              <div className="min-w-0 flex-1"><div className="flex flex-wrap gap-2 items-center"><span className="font-mono text-xs text-muted-foreground">{row.opportunityNumber}</span><span className="text-sm font-medium">{row.name}</span><Badge variant={row.action === "conflict" ? "destructive" : "outline"}>{actionLabel(row.action)}</Badge></div>{row.issue && <p className="text-xs mt-1 text-muted-foreground flex gap-1.5"><AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />{row.issue}</p>}{!row.issue && row.action === "create" && <p className="text-xs text-muted-foreground mt-1">Will create a project from this awarded bid.</p>}{!row.issue && row.action === "add_contract" && <p className="text-xs text-muted-foreground mt-1">Will add a contract to project #{row.targetProjectId || row.migratedFromProjectId}.</p>}</div>
            </label>;
          })}</div>
            <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Only explicitly selected, non-conflicting records will be changed. Conflicts remain untouched.</p><Button className="min-h-11" onClick={approve} disabled={!selected.length || run.isPending}>{run.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Approve {selected.length ? `${selected.length} selected` : "selected records"}</Button></div>
          </>}
        {results.length > 0 && <section className="mt-5 border-t pt-4" aria-label="Catch-up results">
          <h3 className="font-semibold text-sm">Latest run results</h3>
          <div className="mt-2 space-y-2">{results.map((result, index) => {
            const opportunity = rows.find(row => row.id === result.opportunityId);
            return <div key={`${result.opportunityId}-${index}`} className={`rounded-lg border p-3 ${result.success ? "border-primary/20 bg-primary/[0.025]" : "border-destructive/25 bg-destructive/[0.035]"}`} data-testid={`catch-up-result-${result.opportunityId}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{opportunity?.opportunityNumber ?? `Opportunity #${result.opportunityId}`} · {opportunity?.name ?? "Award record"}</p>
                {result.success && result.projectId
                  ? <Link href={`/projects/${result.projectId}?tab=bids`} className="inline-flex min-h-9 items-center text-sm text-primary hover:underline" data-testid={`catch-up-project-${result.projectId}`}>Open project #{result.projectId}</Link>
                  : <Badge variant={result.success ? "secondary" : "destructive"}>{result.success ? "Completed" : "Failed"}</Badge>}
              </div>
              {result.message && <p className={`mt-1 text-xs ${result.success ? "text-muted-foreground" : "text-destructive"}`} role={result.success ? undefined : "alert"}>{result.message}</p>}
            </div>;
          })}</div>
        </section>}
      </div>}
    </CardContent>
  </Card>;
}
