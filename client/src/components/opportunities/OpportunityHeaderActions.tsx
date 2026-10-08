import { Archive, ArchiveRestore, ArrowUpRight, Pencil } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

type HeaderOpportunity = {
  id: number;
  status: string;
  isArchived?: boolean | null;
  convertedProjectId?: number | null;
};

export function OpportunityHeaderActions({
  opportunity,
  onEdit,
  onChangeStatus,
  onToggleArchive,
  archivePending = false,
}: {
  opportunity: HeaderOpportunity;
  onEdit: () => void;
  onChangeStatus: () => void;
  onToggleArchive: () => void;
  archivePending?: boolean;
}) {
  const awarded = opportunity.status === "awarded";
  return <div className="flex flex-wrap gap-2">
    {opportunity.convertedProjectId && <Link href={`/projects/${opportunity.convertedProjectId}?tab=bids`} className="inline-flex items-center justify-center min-h-11 rounded-md bg-primary px-4 text-sm text-primary-foreground hover:bg-primary/90">Open project <ArrowUpRight className="w-4 h-4 ml-2" /></Link>}
    <Button className="min-h-11" variant="outline" onClick={onEdit} data-testid="button-edit-opportunity"><Pencil className="w-4 h-4 mr-2" />Edit</Button>
    <Button className="min-h-11" variant="outline" disabled={awarded} onClick={onChangeStatus} data-testid="button-change-opportunity-status">Change status</Button>
    <Button className="min-h-11" variant="outline" disabled={archivePending || awarded} onClick={onToggleArchive} data-testid="button-toggle-opportunity-archive">
      {opportunity.isArchived ? <ArchiveRestore className="w-4 h-4 mr-2" /> : <Archive className="w-4 h-4 mr-2" />}
      {opportunity.isArchived ? "Restore" : "Archive"}
    </Button>
  </div>;
}
