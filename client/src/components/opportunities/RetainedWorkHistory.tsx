import { Download, ExternalLink, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProxyUrl, getProxyUrlWithFilename } from "@/lib/utils";

type RecordRow = Record<string, any>;

const retainedSections = [
  ["photos", "Project photos"],
  ["photoAlbums", "Photo albums"],
  ["dailyReports", "Daily reports"],
  ["reportTaskEntries", "Daily report task entries"],
  ["reportLabor", "Daily report labor"],
  ["reportEquipment", "Daily report equipment"],
  ["reportDeliveries", "Daily report deliveries"],
  ["reportInspections", "Daily report inspections"],
  ["reportPhotos", "Daily report photos"],
  ["emails", "Project emails"],
  ["emailAttachments", "Email attachments"],
  ["rfis", "Requests for information"],
  ["rfiResponses", "RFI responses"],
  ["scheduleEntries", "Schedule entries"],
  ["allocations", "Labor / resource allocations"],
  ["fingercheckMappings", "Fingercheck mappings"],
  ["reportRecipients", "Daily report recipients"],
  ["notifications", "Notifications"],
] as const;

const knownLabels: Record<string, string> = {
  id: "Record ID", name: "Name", title: "Title", description: "Description", notes: "Notes",
  status: "Status", createdAt: "Created", updatedAt: "Last updated", deletedAt: "Deleted",
  takenAt: "Photo taken", capturedAt: "Captured", reportDate: "Report date", date: "Date",
  startDate: "Start date", endDate: "End date", dueDate: "Due date", sentAt: "Sent",
  receivedAt: "Received", deliveredAt: "Delivered", inspectionDate: "Inspection date",
  scheduledDate: "Scheduled date", scheduledStart: "Scheduled start", scheduledEnd: "Scheduled end",
  subject: "Subject", emailSubject: "Email subject", from: "From", to: "To", cc: "CC",
  body: "Message", bodyHtml: "Message", htmlBody: "Message", response: "Response",
  question: "Question", rfiNumber: "RFI number", reportNumber: "Report number",
  albumName: "Album", photoName: "Photo", fileName: "File name", filename: "File name",
  taskName: "Task", taskDescription: "Task details", laborType: "Labor type",
  employeeName: "Employee", workerName: "Worker", hours: "Hours", laborHours: "Labor hours",
  regularHours: "Regular hours", overtimeHours: "Overtime hours", equipmentName: "Equipment",
  equipmentType: "Equipment type", quantity: "Quantity", unit: "Unit", amount: "Amount",
  cost: "Cost", deliveryType: "Delivery type", material: "Material", supplier: "Supplier",
  inspectorName: "Inspector", inspectionType: "Inspection type", result: "Result",
  recipientName: "Recipient", recipientEmail: "Recipient email", userName: "User",
  email: "Email", phone: "Phone", allocationType: "Allocation type", allocatedHours: "Allocated hours",
  fingercheckId: "Fingercheck ID", externalId: "External system ID", mappingType: "Mapping type",
  bodyPreview: "Message preview", fromEmail: "From", toEmails: "To", ccEmails: "CC",
  storagePath: "Attachment", weatherSummary: "Weather", temperatureHigh: "High temperature",
  temperatureLow: "Low temperature", windSpeed: "Wind speed", taskTitleSnapshot: "Task title",
  taskId: "Task ID", reportId: "Daily report ID", taskEntryId: "Task entry ID",
  reportRecipient: "Recipient", allDelivered: "All items delivered", missingItemsDetails: "Missing items",
  inspectionAuthority: "Inspection authority", passed: "Passed", crewMember: "Crew member",
  fingercheckJobCode: "Fingercheck job code", fingercheckJobDescription: "Fingercheck job description",
  foremanName: "Foreman",
};

function labelFor(key: string) {
  if (knownLabels[key]) return knownLabels[key];
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

function safeEmailText(value: string) {
  // Render stored mail markup only as inert, readable text. It is never inserted as HTML.
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function displayValue(key: string, value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  if (Array.isArray(value)) return value.map(item => typeof item === "object" && item ? Object.values(item).filter(v => typeof v === "string" || typeof v === "number").join(" · ") : String(item)).filter(Boolean).join(", ");
  if (typeof value === "object") return "";
  const text = String(value);
  if (/html/i.test(key) && /<\/?[a-z][\s\S]*>/i.test(text)) return safeEmailText(text);
  if (/(?:date|time|at)$/i.test(key) && /^\d{4}-\d\d-\d\d/.test(text)) {
    const parsed = text.length === 10
      ? new Date(Number(text.slice(0, 4)), Number(text.slice(5, 7)) - 1, Number(text.slice(8, 10)))
      : new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString(undefined, { dateStyle: "medium", ...(text.includes("T") ? { timeStyle: "short" as const } : {}) });
  }
  return text;
}

const hiddenLocationKeys = new Set(["url", "fileurl", "downloadurl", "imageurl", "cloudinaryurl", "objectpath", "storagepath", "filepath", "pdfurl", "path"]);
function flattenFields(record: RecordRow, prefix = "", depth = 0): Array<{ label: string; value: string }> {
  if (depth > 3) return [];
  return Object.entries(record).flatMap(([key, value]) => {
    if (hiddenLocationKeys.has(key.toLowerCase()) || key.toLowerCase().startsWith("deleted") || /(token|password|secret|credential)/i.test(key)) return [];
    const label = prefix ? `${prefix} · ${labelFor(key)}` : labelFor(key);
    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) return flattenFields(value, label, depth + 1);
    if (key === "signatureValue") return value ? [{ label, value: "Signature retained on the source report" }] : [];
    if (typeof value === "string" && value.length > 1600 && /^[\da-z+/=\s]+$/i.test(value)) return [];
    const text = displayValue(key, value);
    return text ? [{ label, value: text }] : [];
  });
}

export function isRetainedRecordDeleted(record: RecordRow) {
  return record.isDeleted === true || record.deleted === true || !!record.deletedAt ||
    String(record.status ?? record.fileStatus ?? "").toLowerCase() === "deleted";
}

function recordLocation(record: RecordRow) {
  const candidate = [record.url, record.downloadUrl, record.fileUrl, record.pdfUrl, record.cloudinaryUrl, record.imageUrl, record.objectPath, record.storagePath, record.filePath, record.path]
    .find(value => typeof value === "string" && value.trim());
  if (!candidate) return null;
  const location = String(candidate).trim();
  if (/^data:/i.test(location) || /^javascript:/i.test(location)) return null;
  if (!/^https?:\/\//i.test(location) && !location.startsWith("/")) return null;
  return location;
}

function recordName(record: RecordRow, index: number) {
  return record.name || record.title || record.subject || record.fileName || record.filename ||
    record.reportNumber || record.rfiNumber || record.taskName || `Historical record ${index + 1}`;
}

function isPhotoSection(sectionKey: string, record: RecordRow, location: string | null) {
  if (String(record.mediaType ?? "").toLowerCase() === "video") return false;
  return sectionKey.toLowerCase().includes("photo") || sectionKey.toLowerCase().includes("image") ||
    String(record.contentType ?? "").startsWith("image/") ||
    /\.(?:jpe?g|png|gif|webp|heic)(?:[?#].*)?$/i.test(location ?? "");
}

function RetainedRecord({ sectionKey, row, index }: { sectionKey: string; row: RecordRow; index: number }) {
  const deleted = isRetainedRecordDeleted(row);
  const location = deleted ? null : recordLocation(row);
  const name = recordName(row, index);
  const image = location && isPhotoSection(sectionKey, row, location);
  const displayUrl = location ? getProxyUrl(location) : null;
  const downloadUrl = location ? getProxyUrlWithFilename(location, String(row.fileName || row.filename || row.name || name), true) : null;
  const fields = flattenFields(row);
  const dateLabel = row.reportDate || row.takenAt || row.capturedAt || row.createdAt || row.sentAt || row.receivedAt || row.scheduledDate || row.date || row.deletedAt;
  return <details className="rounded-lg border bg-background/70 p-3">
    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm font-medium">
      {image && <ImageIcon className="h-4 w-4 text-primary" />}
      <span className="min-w-0 flex-1">{String(name)}</span>
      {dateLabel && <span className="text-xs font-normal text-muted-foreground">{displayValue("date", dateLabel)}</span>}
      {deleted ? <Badge variant="destructive">Deleted · read only</Badge> : row.status && <Badge variant="outline">{String(row.status).replaceAll("_", " ")}</Badge>}
      <span aria-hidden="true" className="text-muted-foreground">Details</span>
    </summary>
    {displayUrl && image && <a className="mt-3 inline-block" href={displayUrl} target="_blank" rel="noreferrer noopener" aria-label={`Open image ${name}`}>
      <img src={displayUrl} alt={String(name)} loading="lazy" className="max-h-64 max-w-full rounded-md border object-contain" />
    </a>}
    {deleted && <p className="mt-3 text-xs text-destructive">This historical source record is marked deleted. It is shown for context only and cannot be opened or restored.</p>}
    {fields.length > 0 && <dl className="mt-3 grid gap-3 sm:grid-cols-2">{fields.map((field, fieldIndex) => <div key={`${field.label}-${fieldIndex}`} className="min-w-0"><dt className="text-xs uppercase tracking-wide text-muted-foreground">{field.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{field.value}</dd></div>)}</dl>}
    {location && !image && downloadUrl && <a href={downloadUrl} target="_blank" rel="noreferrer noopener" className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm text-primary hover:underline">
      <Download className="h-4 w-4" />Open / download {String(row.fileName || row.filename || row.name || "attachment")}<ExternalLink className="h-3.5 w-3.5" />
    </a>}
  </details>;
}

export function RetainedWorkHistory({ retainedWork }: { retainedWork?: Record<string, any> | null }) {
  const sections = retainedSections.map(([key, title]) => {
    const rows = Array.isArray(retainedWork?.[key]) ? retainedWork![key] as RecordRow[] : [];
    return { key, title, rows };
  }).filter(section => section.rows.length > 0);
  const total = sections.reduce((sum, section) => sum + section.rows.length, 0);
  if (!total) return null;
  return <Card data-testid="retained-work-history">
    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base">Additional retained work <Badge variant="secondary" className="ml-auto">{total} records</Badge></CardTitle><p className="text-sm text-muted-foreground">Read-only source records retained from the retired project. Deleted items are identified and never restored; stored email markup is displayed as text only.</p></CardHeader>
    <CardContent className="space-y-2">
      {sections.map(section => <details key={section.key} className="rounded-lg border bg-muted/15 p-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
          <span className="flex-1">{section.title}</span><Badge variant="outline">{section.rows.length}</Badge><span aria-hidden="true" className="text-xs text-muted-foreground">Expand</span>
        </summary>
        <div className="mt-3 space-y-2">{section.rows.map((row, index) => <RetainedRecord key={row.id ?? row.fileId ?? index} sectionKey={section.key} row={row} index={index} />)}</div>
      </details>)}
    </CardContent>
  </Card>;
}
