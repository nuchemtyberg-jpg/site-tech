import { Link } from "wouter";
import { Activity, Calendar, FileText, Folder, History, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOpportunityMigrationHistory } from "@/hooks/use-project-bids";
import { OPPORTUNITY_CONTACT_ROLES, getOpportunityStatusLabel, labelFor } from "@shared/opportunityStatus";
import { RetainedWorkHistory, isRetainedRecordDeleted } from "@/components/opportunities/RetainedWorkHistory";
import { getProxyUrl, getProxyUrlWithFilename } from "@/lib/utils";

type Entry = Record<string, any>;
const dateText = (value: any) => value ? String(value).slice(0, 16).replace("T", " ") : "Date not recorded";
function RecordList({ title, rows, empty, icon: Icon, render }: { title: string; rows: Entry[]; empty: string; icon: typeof Activity; render: (row: Entry) => React.ReactNode }) {
  return <Card><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Icon className="w-4 h-4 text-primary" />{title}<Badge variant="secondary" className="ml-auto">{rows.length}</Badge></CardTitle></CardHeader><CardContent className="space-y-3">{!rows.length ? <p className="text-sm text-muted-foreground py-3">{empty}</p> : rows.map((row, index) => <div key={row.id ?? row.link?.id ?? index} className="border-l-2 border-primary/20 pl-3 py-1">{render(row)}</div>)}</CardContent></Card>;
}
function displayStatus(value: string | null | undefined) {
  if (!value) return "Status not recorded";
  try { return getOpportunityStatusLabel(value as any); } catch { return value.replaceAll("_", " "); }
}
export function OpportunityMigrationHistory({ opportunityId }: { opportunityId: number }) {
  const query = useOpportunityMigrationHistory(opportunityId);
  const history = query.data;
  if (query.isLoading) return <div className="space-y-3" aria-label="Loading migration history">{[1, 2, 3].map(id => <div key={id} className="h-24 rounded-xl bg-muted/60 animate-pulse" />)}</div>;
  if (query.isError) return <Card><CardContent className="py-10 text-center"><History className="w-8 h-8 mx-auto text-muted-foreground mb-2" /><p>Couldn’t load retained migration records.</p><Button variant="outline" className="mt-3" onClick={() => query.refetch()}>Retry</Button></CardContent></Card>;
  if (!history) return <Card className="border-dashed"><CardContent className="py-12 text-center"><History className="w-9 h-9 mx-auto text-muted-foreground/60 mb-3" /><p className="font-medium">No migrated source record</p><p className="text-sm text-muted-foreground mt-1">This opportunity was not imported from an older project record.</p></CardContent></Card>;
  if ("issue" in history && history.issue && !history.project) return <Card className="border-amber-700/25"><CardContent className="p-5"><p className="font-semibold">Source project could not be loaded</p><p className="text-sm text-muted-foreground mt-1">{history.issue}</p>{history.sourceId && <p className="font-mono text-xs mt-3">Source reference #{history.sourceId}</p>}</CardContent></Card>;
  const project = history.project ?? {};
  const address = [project.streetAddress, project.address2, project.city, project.state, project.zip].filter(Boolean).join(", ");
  const contacts = history.contacts ?? [];
  return <div className="space-y-5" data-testid="opportunity-migration-history">
    <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 rounded-xl border bg-card p-4 sm:p-5">
      <div><p className="text-xs uppercase tracking-[0.16em] text-primary">Retained source</p><h2 className="text-xl font-semibold mt-1">{project.name || "Historical project record"}</h2><p className="text-sm text-muted-foreground mt-1">{project.projectNumber ? `Project ${project.projectNumber}` : "Legacy project"}{project.status ? ` · ${String(project.status).replaceAll("_", " ")}` : ""}</p>{project.customerName && <p className="text-sm text-muted-foreground mt-1">Customer: {project.customerName}</p>}{address && <p className="text-sm text-muted-foreground mt-2 flex gap-2"><MapPin className="w-4 h-4 shrink-0" />{address}</p>}</div>
      {project.id && <Badge variant="outline">Retired source · #{project.id}</Badge>}
    </header>
    <Card><CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4 text-primary" />Original project terms</CardTitle></CardHeader><CardContent className="grid sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
      {[
        ["Customer", project.customerName || project.customer?.name], ["Project number", project.projectNumber],
        ["Address", address], ["Created", dateText(project.createdAt)], ["Start date", project.startDate],
        ["End date", project.endDate], ["Original value", project.estimatedValue == null ? null : `$${Number(project.estimatedValue).toLocaleString()}`],
        ["Status", project.status ? String(project.status).replaceAll("_", " ") : null],
      ].filter(([, value]) => value != null && value !== "").map(([label, value]) => <div key={label as string}><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1">{value}</p></div>)}
      {project.description && <div className="sm:col-span-2"><p className="text-xs uppercase tracking-wide text-muted-foreground">Description / scope</p><p className="mt-1 whitespace-pre-wrap">{project.description}</p></div>}
      {project.notes && <div className="sm:col-span-2"><p className="text-xs uppercase tracking-wide text-muted-foreground">Notes</p><p className="mt-1 whitespace-pre-wrap">{project.notes}</p></div>}
    </CardContent></Card>
    <RecordList title="Linked contacts & roles" icon={Users} rows={contacts} empty="No source contacts were retained." render={entry => {
      const person = entry.contact ?? {};
      const link = entry.link ?? {};
      const name = [person.firstName, person.lastName].filter(Boolean).join(" ") || person.name || "Contact";
      const role = link.roleLabel || (link.role ? labelFor(OPPORTUNITY_CONTACT_ROLES, link.role) : null);
      return <div><div className="font-medium flex items-center gap-2">{name}{link.isPrimary && <Badge variant="outline">Primary</Badge>}</div><p className="text-sm text-muted-foreground">{[role, person.jobTitle, person.email, person.mobilePhone || person.officePhone].filter(Boolean).join(" · ") || "No contact details recorded"}</p></div>;
    }} />
    <div className="grid lg:grid-cols-2 gap-4">
      <RecordList title="Status history" icon={History} rows={history.statusHistory ?? []} empty="No historical status transitions." render={row => <><p className="font-medium">{row.previousStatus ? `${displayStatus(row.previousStatus)} → ` : ""}{displayStatus(row.newStatus || row.status)}</p><p className="text-xs text-muted-foreground mt-1">{row.changedByName || row.actorName || "System"} · {dateText(row.changedAt || row.createdAt)}</p></>} />
      <RecordList title="Activity log" icon={Activity} rows={history.activity ?? []} empty="No historical activity entries." render={row => <><p className="text-sm">{row.description || row.action || "Activity entry"}</p><p className="text-xs text-muted-foreground mt-1">{row.actorName || row.userName || "System"} · {dateText(row.createdAt)}</p></>} />
      <RecordList title="Retained todos" icon={Calendar} rows={history.todos ?? []} empty="No historical todos." render={row => <><p className="font-medium">{row.title || "Todo"}</p><p className="text-sm text-muted-foreground">{[row.status, row.assignedToName || row.assigneeName, row.dueDate ? `Due ${row.dueDate}` : null, row.priority].filter(Boolean).join(" · ")}</p>{row.description && <p className="text-sm mt-1 whitespace-pre-wrap">{row.description}</p>}</>} />
      <RecordList title="Retained tasks" icon={Calendar} rows={history.tasks ?? []} empty="No historical tasks." render={row => <><p className="font-medium">{row.title || row.name || "Task"}</p><p className="text-sm text-muted-foreground">{[row.status, row.scheduledDate ? `Scheduled ${row.scheduledDate}` : null, row.percentComplete != null ? `${row.percentComplete}% complete` : null].filter(Boolean).join(" · ")}</p>{row.description && <p className="text-sm mt-1 whitespace-pre-wrap">{row.description}</p>}</>} />
      <RecordList title="Communications" icon={Activity} rows={history.communications ?? []} empty="No historical communications." render={row => <><p className="font-medium">{row.subject || row.type || "Communication"}</p><p className="text-xs text-muted-foreground mt-1">{[row.type, row.contactName, dateText(row.contactDate || row.createdAt)].filter(Boolean).join(" · ")}</p>{row.notes && <p className="text-sm mt-1 whitespace-pre-wrap">{row.notes}</p>}</>} />
      <RecordList title="Retained document folders" icon={Folder} rows={history.folders ?? []} empty="No retained source folders." render={row => <><p className="font-medium">{row.name || "Folder"}</p><p className="text-xs text-muted-foreground">{row.path || (row.parentId ? `Parent folder #${row.parentId}` : "Source root")}</p></>} />
      <RecordList title="Retained document files" icon={FileText} rows={history.files ?? []} empty="No retained source files." render={row => {
        const deleted = isRetainedRecordDeleted(row);
        const name = row.name || row.fileName || row.filename || "File";
        const location = deleted ? null : row.url || row.fileUrl || row.pdfUrl || row.imageUrl || row.cloudinaryUrl || row.objectPath || row.storagePath || row.filePath || row.path;
        const safeLocation = typeof location === "string" && (/^https?:\/\//i.test(location) || location.startsWith("/")) ? location : null;
        const href = safeLocation && getProxyUrlWithFilename(safeLocation, String(name), true);
        const imageUrl = safeLocation && String(row.contentType || "").startsWith("image/") ? getProxyUrl(safeLocation) : null;
        return <><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{name}</p>{deleted && <Badge variant="destructive">Deleted · read only</Badge>}</div><p className="text-xs text-muted-foreground">{[row.category, row.description, row.createdAt ? dateText(row.createdAt) : null, row.deletedAt ? `Deleted ${dateText(row.deletedAt)}` : null].filter(Boolean).join(" · ") || "Historical file record"}</p>{imageUrl && <a href={imageUrl} target="_blank" rel="noreferrer noopener"><img src={imageUrl} alt={String(name)} loading="lazy" className="mt-2 max-h-48 rounded-md border object-contain" /></a>}{href && <a href={href} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex min-h-9 items-center text-sm text-primary hover:underline">Open / download {name}</a>}</>;
      }} />
    </div>
    <RetainedWorkHistory retainedWork={history.retainedWork} />
    {history.issue && <p className="text-sm text-amber-800 dark:text-amber-300 border border-amber-700/20 rounded-lg p-3">{history.issue}</p>}
  </div>;
}
