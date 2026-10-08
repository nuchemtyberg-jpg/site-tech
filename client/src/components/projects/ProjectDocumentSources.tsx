import { useState } from "react";
import { AlertCircle, FolderOpen } from "lucide-react";
import { DocumentsTool } from "@/components/documents/DocumentsTool";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjectDocumentSources } from "@/hooks/use-project-bids";

export function ProjectDocumentSources({ projectId }: { projectId: number }) {
  const query = useProjectDocumentSources(projectId);
  const [selected, setSelected] = useState("");
  const sources = query.data ?? [];
  const active = sources.find(source => `${source.entityType}:${source.entityId}` === selected) ?? sources[0];
  if (query.isLoading) return <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-12 rounded-lg bg-muted/60 animate-pulse" />)}</div>;
  if (query.isError) return <div className="border border-dashed rounded-xl py-10 text-center"><AlertCircle className="mx-auto h-7 w-7 text-muted-foreground mb-2" /><p>Couldn’t load document sources.</p><Button variant="outline" className="mt-3" onClick={() => query.refetch()}>Retry</Button></div>;
  if (!active) return <div className="rounded-xl border border-dashed border-border py-14 text-center"><FolderOpen className="h-9 w-9 mx-auto text-muted-foreground/60 mb-3" /><p className="font-medium">No document source is available</p><p className="text-sm text-muted-foreground mt-1">A project or bid-owned document tree will appear here when one exists.</p></div>;
  return <div className="space-y-3">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2"><FolderOpen className="h-4 w-4 text-primary" /><div><p className="text-sm font-medium">Document source</p><p className="text-xs text-muted-foreground">Bid files remain in their original owner tree.</p></div></div>
      {sources.length > 1 ? <Select value={selected || `${active.entityType}:${active.entityId}`} onValueChange={setSelected}><SelectTrigger className="min-h-11 w-full sm:w-[310px]"><SelectValue /></SelectTrigger><SelectContent>{sources.map(source => <SelectItem key={`${source.entityType}:${source.entityId}`} value={`${source.entityType}:${source.entityId}`}>{source.label}</SelectItem>)}</SelectContent></Select> : <span className="text-sm font-medium sm:max-w-[50%] sm:text-right">{active.label}</span>}
    </div>
    <DocumentsTool entityType={active.entityType} entityId={active.entityId} projectContextId={active.entityType === "opportunity" ? projectId : undefined} nativeProjectTree={active.entityType === "project"} />
  </div>;
}
