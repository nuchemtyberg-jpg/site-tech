import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Send,
  FileText,
  Paperclip,
  X,
  ArrowLeft,
  RefreshCw,
  Trash2,
  Clock,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  Loader2,
} from "lucide-react";
import type { Project, Rfi } from "@shared/schema";

interface RfiTabProps {
  project: Project;
}

type RfiView = "list" | "create" | "detail";

function getStatusBadge(status: string) {
  switch (status) {
    case "draft":
      return <Badge variant="secondary" data-testid="badge-status-draft">Draft</Badge>;
    case "open":
      return <Badge variant="default" data-testid="badge-status-open">Open</Badge>;
    case "responded":
      return <Badge className="bg-green-600 text-white border-green-700" data-testid="badge-status-responded">Responded</Badge>;
    case "closed":
      return <Badge variant="outline" data-testid="badge-status-closed">Closed</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function getPriorityBadge(priority: string) {
  switch (priority) {
    case "urgent":
      return <Badge className="bg-red-600 text-white border-red-700" data-testid="badge-priority-urgent">Urgent</Badge>;
    case "high":
      return <Badge className="bg-orange-500 text-white border-orange-600" data-testid="badge-priority-high">High</Badge>;
    case "normal":
      return <Badge variant="secondary" data-testid="badge-priority-normal">Normal</Badge>;
    case "low":
      return <Badge variant="outline" data-testid="badge-priority-low">Low</Badge>;
    default:
      return <Badge variant="secondary">{priority}</Badge>;
  }
}

function formatDate(date: string | Date | null) {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function RfiTab({ project }: RfiTabProps) {
  const [view, setView] = useState<RfiView>("list");
  const [selectedRfiId, setSelectedRfiId] = useState<number | null>(null);
  const { toast } = useToast();

  const handleViewRfi = (rfiId: number) => {
    setSelectedRfiId(rfiId);
    setView("detail");
  };

  const handleBack = () => {
    setSelectedRfiId(null);
    setView("list");
  };

  if (view === "create") {
    return <RfiCreateForm project={project} onBack={handleBack} onCreated={(rfi) => { setSelectedRfiId(rfi.id); setView("detail"); }} />;
  }

  if (view === "detail" && selectedRfiId) {
    return <RfiDetailView rfiId={selectedRfiId} project={project} onBack={handleBack} />;
  }

  return <RfiListView project={project} onCreateNew={() => setView("create")} onViewRfi={handleViewRfi} />;
}

function RfiListView({ project, onCreateNew, onViewRfi }: { project: Project; onCreateNew: () => void; onViewRfi: (id: number) => void }) {
  const { data: rfis = [], isLoading } = useQuery<Rfi[]>({
    queryKey: ["/api/projects", project.id, "rfis"],
  });

  const { data: outlookStatus } = useQuery<{ connected: boolean; email: string | null }>({
    queryKey: ["/api/outlook/status"],
  });

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold" data-testid="text-rfis-title">Requests for Information</h2>
          <p className="text-sm text-muted-foreground">
            {rfis.length} RFI{rfis.length !== 1 ? "s" : ""}
            {outlookStatus?.connected && outlookStatus.email && (
              <span className="ml-2">
                Sending from: <span className="font-medium">{outlookStatus.email}</span>
              </span>
            )}
          </p>
        </div>
        <Button onClick={onCreateNew} data-testid="button-create-rfi">
          <Plus className="w-4 h-4 mr-2" />
          New RFI
        </Button>
      </div>

      {!outlookStatus?.connected && (
        <Card className="p-4 border-orange-300 dark:border-orange-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            <div>
              <p className="font-medium text-sm">Outlook Not Connected</p>
              <p className="text-xs text-muted-foreground">The Outlook connector needs to be set up to send RFIs via email. You can still create draft RFIs.</p>
            </div>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : rfis.length === 0 ? (
        <Card className="p-8 text-center">
          <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium mb-1">No RFIs Yet</p>
          <p className="text-sm text-muted-foreground mb-4">Create your first Request for Information to get started.</p>
          <Button onClick={onCreateNew} data-testid="button-create-first-rfi">
            <Plus className="w-4 h-4 mr-2" />
            Create RFI
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {rfis.map((rfi) => (
            <Card
              key={rfi.id}
              className="p-4 cursor-pointer hover-elevate"
              onClick={() => onViewRfi(rfi.id)}
              data-testid={`card-rfi-${rfi.id}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-mono text-sm font-semibold" data-testid={`text-rfi-number-${rfi.id}`}>
                      RFI-{String(rfi.rfiNumber).padStart(3, "0")}
                    </span>
                    {getStatusBadge(rfi.status)}
                    {getPriorityBadge(rfi.priority)}
                  </div>
                  <p className="font-medium text-sm truncate" data-testid={`text-rfi-subject-${rfi.id}`}>{rfi.subject}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    To: {rfi.directedTo} ({rfi.directedToEmail})
                    {rfi.dueDate && <span className="ml-2">Due: {formatDate(rfi.dueDate)}</span>}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {rfi.sentAt ? formatDate(rfi.sentAt) : formatDate(rfi.createdAt)}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function RfiCreateForm({ project, onBack, onCreated }: { project: Project; onBack: () => void; onCreated: (rfi: Rfi) => void }) {
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [directedTo, setDirectedTo] = useState("");
  const [directedToEmail, setDirectedToEmail] = useState("");
  const [ccEmails, setCcEmails] = useState("");
  const [priority, setPriority] = useState("normal");
  const [dueDate, setDueDate] = useState("");
  const [additionalBody, setAdditionalBody] = useState("");

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", `/api/projects/${project.id}/rfis`, data);
      return res.json();
    },
    onSuccess: (rfi: Rfi) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "rfis"] });
      toast({ title: "RFI Created", description: `RFI-${String(rfi.rfiNumber).padStart(3, "0")} created as draft.` });
      onCreated(rfi);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to create RFI", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !question || !directedTo || !directedToEmail) {
      toast({ title: "Missing Fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }

    createMutation.mutate({
      subject,
      question,
      directedTo,
      directedToEmail,
      ccEmails: ccEmails ? ccEmails.split(",").map((e) => e.trim()).filter(Boolean) : [],
      priority,
      dueDate: dueDate || null,
      additionalBody: additionalBody || null,
      status: "draft",
    });
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-from-create">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h2 className="text-lg font-semibold">New RFI</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="rfi-directed-to">Directed To (Name) *</Label>
            <Input
              id="rfi-directed-to"
              value={directedTo}
              onChange={(e) => setDirectedTo(e.target.value)}
              placeholder="e.g. John Smith"
              data-testid="input-directed-to"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rfi-directed-email">Directed To (Email) *</Label>
            <Input
              id="rfi-directed-email"
              type="email"
              value={directedToEmail}
              onChange={(e) => setDirectedToEmail(e.target.value)}
              placeholder="e.g. john@company.com"
              data-testid="input-directed-email"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="rfi-subject">Subject *</Label>
          <Input
            id="rfi-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Brief description of the information needed"
            data-testid="input-rfi-subject"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="rfi-question">Question / Description *</Label>
          <Textarea
            id="rfi-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Describe the information you need in detail..."
            className="min-h-[120px]"
            data-testid="input-rfi-question"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="rfi-additional">Additional Details</Label>
          <Textarea
            id="rfi-additional"
            value={additionalBody}
            onChange={(e) => setAdditionalBody(e.target.value)}
            placeholder="Any additional context or references..."
            className="min-h-[80px]"
            data-testid="input-rfi-additional"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="rfi-cc">CC Emails</Label>
            <Input
              id="rfi-cc"
              value={ccEmails}
              onChange={(e) => setCcEmails(e.target.value)}
              placeholder="email1@co.com, email2@co.com"
              data-testid="input-cc-emails"
            />
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger data-testid="select-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rfi-due">Due Date</Label>
            <Input
              id="rfi-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              data-testid="input-due-date"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onBack} data-testid="button-cancel-rfi">
            Cancel
          </Button>
          <Button type="submit" disabled={createMutation.isPending} data-testid="button-save-rfi-draft">
            {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            Save as Draft
          </Button>
        </div>
      </form>
    </div>
  );
}

function RfiDetailView({ rfiId, project, onBack }: { rfiId: number; project: Project; onBack: () => void }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: rfi, isLoading } = useQuery<Rfi>({
    queryKey: ["/api/rfis", rfiId],
  });

  const { data: responses = [] } = useQuery<any[]>({
    queryKey: ["/api/rfis", rfiId, "responses"],
    enabled: !!rfi && rfi.status !== "draft",
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/rfis/${rfiId}/send`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfis", rfiId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "rfis"] });
      toast({ title: "RFI Sent", description: "The RFI has been sent via email with the PDF attached." });
    },
    onError: (err: any) => {
      toast({ title: "Send Failed", description: err.message || "Failed to send RFI. Check your Outlook connection.", variant: "destructive" });
    },
  });

  const checkRepliesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/rfis/${rfiId}/check-replies`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfis", rfiId] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfis", rfiId, "responses"] });
      if (data.newCount > 0) {
        toast({ title: "New Replies", description: `${data.newCount} new response(s) found.` });
      } else {
        toast({ title: "No New Replies", description: "No new responses found." });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to check for replies.", variant: "destructive" });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/rfis/${rfiId}/attachments`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfis", rfiId] });
      toast({ title: "Attached", description: "File attached to RFI." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to upload attachment.", variant: "destructive" });
    },
  });

  const removeAttachmentMutation = useMutation({
    mutationFn: async (index: number) => {
      const res = await apiRequest("DELETE", `/api/rfis/${rfiId}/attachments/${index}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfis", rfiId] });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await apiRequest("PATCH", `/api/rfis/${rfiId}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfis", rfiId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "rfis"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/rfis/${rfiId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "rfis"] });
      toast({ title: "Deleted", description: "RFI has been deleted." });
      onBack();
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
    e.target.value = "";
  };

  const parseAttachments = (attachments: string[] | null): Array<{ name: string; path: string; contentType: string; size: number }> => {
    if (!attachments) return [];
    return attachments.map((att) => {
      try {
        return JSON.parse(att);
      } catch {
        return null;
      }
    }).filter(Boolean);
  };

  if (isLoading || !rfi) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const attachments = parseAttachments(rfi.attachments);
  const isDraft = rfi.status === "draft";
  const isSent = rfi.status !== "draft";

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-from-detail">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-lg font-semibold font-mono" data-testid="text-rfi-detail-number">
            RFI-{String(rfi.rfiNumber).padStart(3, "0")}
          </h2>
          {getStatusBadge(rfi.status)}
          {getPriorityBadge(rfi.priority)}
        </div>
        <div className="flex items-center gap-2">
          {isDraft && (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                data-testid="button-delete-rfi"
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Delete
              </Button>
              <Button
                onClick={() => sendMutation.mutate()}
                disabled={sendMutation.isPending}
                data-testid="button-send-rfi"
              >
                {sendMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Send RFI
              </Button>
            </>
          )}
          {isSent && rfi.status !== "closed" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => checkRepliesMutation.mutate()}
                disabled={checkRepliesMutation.isPending}
                data-testid="button-check-replies"
              >
                {checkRepliesMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                Check Replies
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateStatusMutation.mutate("closed")}
                data-testid="button-close-rfi"
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                Close RFI
              </Button>
            </>
          )}
          {rfi.status === "closed" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateStatusMutation.mutate("open")}
              data-testid="button-reopen-rfi"
            >
              Reopen
            </Button>
          )}
        </div>
      </div>

      <Card className="p-4">
        <div className="space-y-3">
          <div>
            <p className="text-sm text-muted-foreground">Subject</p>
            <p className="font-medium" data-testid="text-rfi-detail-subject">{rfi.subject}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Directed To</p>
              <p data-testid="text-rfi-detail-to">{rfi.directedTo} ({rfi.directedToEmail})</p>
            </div>
            {rfi.ccEmails && rfi.ccEmails.length > 0 && (
              <div>
                <p className="text-sm text-muted-foreground">CC</p>
                <p>{rfi.ccEmails.join(", ")}</p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Priority</p>
              <p>{(rfi.priority || "normal").charAt(0).toUpperCase() + (rfi.priority || "normal").slice(1)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Due Date</p>
              <p>{rfi.dueDate ? formatDate(rfi.dueDate) : "None"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{isSent ? "Sent" : "Created"}</p>
              <p>{formatDate(rfi.sentAt || rfi.createdAt)}</p>
            </div>
          </div>
          {rfi.sentByName && (
            <div>
              <p className="text-sm text-muted-foreground">Sent By</p>
              <p>{rfi.sentByName} {rfi.sentByEmail && `(${rfi.sentByEmail})`}</p>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold mb-2">Question / Description</h3>
        <p className="whitespace-pre-wrap text-sm" data-testid="text-rfi-detail-question">{rfi.question}</p>
        {rfi.additionalBody && (
          <>
            <h3 className="font-semibold mt-4 mb-2">Additional Details</h3>
            <p className="whitespace-pre-wrap text-sm">{rfi.additionalBody}</p>
          </>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="font-semibold">Attachments ({attachments.length})</h3>
          {isDraft && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                data-testid="input-rfi-file-upload"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
                data-testid="button-attach-file"
              >
                {uploadMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Paperclip className="w-4 h-4 mr-1" />}
                Attach File
              </Button>
            </>
          )}
        </div>
        {attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attachments</p>
        ) : (
          <div className="space-y-2">
            {attachments.map((att, i) => (
              <div key={i} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate" data-testid={`text-attachment-${i}`}>{att.name}</span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {att.size ? `${(att.size / 1024).toFixed(1)} KB` : ""}
                  </span>
                </div>
                {isDraft && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="flex-shrink-0"
                    onClick={() => removeAttachmentMutation.mutate(i)}
                    data-testid={`button-remove-attachment-${i}`}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {rfi.pdfUrl && (
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-muted-foreground" />
            <a
              href={rfi.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
              data-testid="link-download-pdf"
            >
              Download Generated PDF
            </a>
          </div>
        </Card>
      )}

      {isSent && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Responses ({responses.length})
          </h3>
          {responses.length === 0 ? (
            <div className="text-center py-4">
              <Clock className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No responses yet. Click "Check Replies" to look for new responses.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {responses.map((resp: any) => (
                <div key={resp.id} className="p-3 rounded-md bg-muted/50 space-y-1" data-testid={`response-${resp.id}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <p className="font-medium text-sm">{resp.fromName || resp.fromEmail}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(resp.receivedAt)}</p>
                  </div>
                  <p className="text-sm">{resp.bodyPreview}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
