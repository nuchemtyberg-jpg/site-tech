import { useState, useRef, useEffect } from "react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  Pencil,
  Download,
  Mail,
  Eye,
} from "lucide-react";
import type { Project, Rfi } from "@shared/schema";

interface RfiTabProps {
  project: Project;
}

type RfiView = "list" | "create" | "detail" | "edit" | "preview-send";

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

  const handleViewRfi = (rfiId: number) => {
    setSelectedRfiId(rfiId);
    setView("detail");
  };

  const handleBack = () => {
    setSelectedRfiId(null);
    setView("list");
  };

  const handleBackToDetail = () => {
    setView("detail");
  };

  if (view === "create") {
    return <RfiCreateForm project={project} onBack={handleBack} onCreated={(rfi) => { setSelectedRfiId(rfi.id); setView("detail"); }} />;
  }

  if (view === "edit" && selectedRfiId) {
    return <RfiEditForm rfiId={selectedRfiId} project={project} onBack={handleBackToDetail} onSaved={() => setView("detail")} />;
  }

  if (view === "preview-send" && selectedRfiId) {
    return <RfiEmailPreview rfiId={selectedRfiId} project={project} onBack={handleBackToDetail} onSent={() => setView("detail")} />;
  }

  if (view === "detail" && selectedRfiId) {
    return (
      <RfiDetailView
        rfiId={selectedRfiId}
        project={project}
        onBack={handleBack}
        onEdit={() => setView("edit")}
        onPreviewSend={() => setView("preview-send")}
      />
    );
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

      <RfiForm
        subject={subject} setSubject={setSubject}
        question={question} setQuestion={setQuestion}
        directedTo={directedTo} setDirectedTo={setDirectedTo}
        directedToEmail={directedToEmail} setDirectedToEmail={setDirectedToEmail}
        ccEmails={ccEmails} setCcEmails={setCcEmails}
        priority={priority} setPriority={setPriority}
        dueDate={dueDate} setDueDate={setDueDate}
        additionalBody={additionalBody} setAdditionalBody={setAdditionalBody}
        onSubmit={handleSubmit}
        onCancel={onBack}
        submitLabel="Save as Draft"
        submitIcon={<FileText className="w-4 h-4 mr-2" />}
        isPending={createMutation.isPending}
        testIdPrefix="create"
      />
    </div>
  );
}

function RfiEditForm({ rfiId, project, onBack, onSaved }: { rfiId: number; project: Project; onBack: () => void; onSaved: () => void }) {
  const { toast } = useToast();

  const { data: rfi, isLoading } = useQuery<Rfi>({
    queryKey: ["/api/rfis", rfiId],
  });

  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [directedTo, setDirectedTo] = useState("");
  const [directedToEmail, setDirectedToEmail] = useState("");
  const [ccEmails, setCcEmails] = useState("");
  const [priority, setPriority] = useState("normal");
  const [dueDate, setDueDate] = useState("");
  const [additionalBody, setAdditionalBody] = useState("");

  useEffect(() => {
    if (rfi) {
      setSubject(rfi.subject || "");
      setQuestion(rfi.question || "");
      setDirectedTo(rfi.directedTo || "");
      setDirectedToEmail(rfi.directedToEmail || "");
      setCcEmails(rfi.ccEmails?.join(", ") || "");
      setPriority(rfi.priority || "normal");
      setDueDate(rfi.dueDate ? String(rfi.dueDate).split("T")[0] : "");
      setAdditionalBody(rfi.additionalBody || "");
    }
  }, [rfi]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/rfis/${rfiId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfis", rfiId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "rfis"] });
      toast({ title: "RFI Updated", description: "Changes saved." });
      onSaved();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update RFI", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !question || !directedTo || !directedToEmail) {
      toast({ title: "Missing Fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }

    updateMutation.mutate({
      subject,
      question,
      directedTo,
      directedToEmail,
      ccEmails: ccEmails ? ccEmails.split(",").map((e) => e.trim()).filter(Boolean) : [],
      priority,
      dueDate: dueDate || null,
      additionalBody: additionalBody || null,
    });
  };

  if (isLoading || !rfi) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-from-edit">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h2 className="text-lg font-semibold">Edit RFI-{String(rfi.rfiNumber).padStart(3, "0")}</h2>
      </div>

      <RfiForm
        subject={subject} setSubject={setSubject}
        question={question} setQuestion={setQuestion}
        directedTo={directedTo} setDirectedTo={setDirectedTo}
        directedToEmail={directedToEmail} setDirectedToEmail={setDirectedToEmail}
        ccEmails={ccEmails} setCcEmails={setCcEmails}
        priority={priority} setPriority={setPriority}
        dueDate={dueDate} setDueDate={setDueDate}
        additionalBody={additionalBody} setAdditionalBody={setAdditionalBody}
        onSubmit={handleSubmit}
        onCancel={onBack}
        submitLabel="Save Changes"
        submitIcon={<CheckCircle className="w-4 h-4 mr-2" />}
        isPending={updateMutation.isPending}
        testIdPrefix="edit"
      />
    </div>
  );
}

interface RfiFormProps {
  subject: string; setSubject: (v: string) => void;
  question: string; setQuestion: (v: string) => void;
  directedTo: string; setDirectedTo: (v: string) => void;
  directedToEmail: string; setDirectedToEmail: (v: string) => void;
  ccEmails: string; setCcEmails: (v: string) => void;
  priority: string; setPriority: (v: string) => void;
  dueDate: string; setDueDate: (v: string) => void;
  additionalBody: string; setAdditionalBody: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  submitLabel: string;
  submitIcon: React.ReactNode;
  isPending: boolean;
  testIdPrefix: string;
}

function RfiForm(props: RfiFormProps) {
  return (
    <form onSubmit={props.onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`rfi-directed-to-${props.testIdPrefix}`}><span className="text-red-500">*</span> Directed To (Name)</Label>
          <Input
            id={`rfi-directed-to-${props.testIdPrefix}`}
            value={props.directedTo}
            onChange={(e) => props.setDirectedTo(e.target.value)}
            placeholder="e.g. John Smith"
            data-testid={`input-directed-to-${props.testIdPrefix}`}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`rfi-directed-email-${props.testIdPrefix}`}><span className="text-red-500">*</span> Directed To (Email)</Label>
          <Input
            id={`rfi-directed-email-${props.testIdPrefix}`}
            type="email"
            value={props.directedToEmail}
            onChange={(e) => props.setDirectedToEmail(e.target.value)}
            placeholder="e.g. john@company.com"
            data-testid={`input-directed-email-${props.testIdPrefix}`}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`rfi-subject-${props.testIdPrefix}`}><span className="text-red-500">*</span> Subject</Label>
        <Input
          id={`rfi-subject-${props.testIdPrefix}`}
          value={props.subject}
          onChange={(e) => props.setSubject(e.target.value)}
          placeholder="Brief description of the information needed"
          data-testid={`input-rfi-subject-${props.testIdPrefix}`}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`rfi-question-${props.testIdPrefix}`}><span className="text-red-500">*</span> Question / Description</Label>
        <Textarea
          id={`rfi-question-${props.testIdPrefix}`}
          value={props.question}
          onChange={(e) => props.setQuestion(e.target.value)}
          placeholder="Describe the information you need in detail..."
          className="min-h-[120px]"
          data-testid={`input-rfi-question-${props.testIdPrefix}`}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`rfi-additional-${props.testIdPrefix}`}>Additional Details</Label>
        <Textarea
          id={`rfi-additional-${props.testIdPrefix}`}
          value={props.additionalBody}
          onChange={(e) => props.setAdditionalBody(e.target.value)}
          placeholder="Any additional context or references..."
          className="min-h-[80px]"
          data-testid={`input-rfi-additional-${props.testIdPrefix}`}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`rfi-cc-${props.testIdPrefix}`}>CC Emails</Label>
          <Input
            id={`rfi-cc-${props.testIdPrefix}`}
            value={props.ccEmails}
            onChange={(e) => props.setCcEmails(e.target.value)}
            placeholder="email1@co.com, email2@co.com"
            data-testid={`input-cc-emails-${props.testIdPrefix}`}
          />
        </div>
        <div className="space-y-2">
          <Label>Priority</Label>
          <Select value={props.priority} onValueChange={props.setPriority}>
            <SelectTrigger data-testid={`select-priority-${props.testIdPrefix}`}>
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
          <Label htmlFor={`rfi-due-${props.testIdPrefix}`}>Due Date</Label>
          <Input
            id={`rfi-due-${props.testIdPrefix}`}
            type="date"
            value={props.dueDate}
            onChange={(e) => props.setDueDate(e.target.value)}
            data-testid={`input-due-date-${props.testIdPrefix}`}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={props.onCancel} data-testid={`button-cancel-${props.testIdPrefix}`}>
          Cancel
        </Button>
        <Button type="submit" disabled={props.isPending} data-testid={`button-submit-${props.testIdPrefix}`}>
          {props.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : props.submitIcon}
          {props.submitLabel}
        </Button>
      </div>
    </form>
  );
}

function RfiEmailPreview({ rfiId, project, onBack, onSent }: { rfiId: number; project: Project; onBack: () => void; onSent: () => void }) {
  const { toast } = useToast();
  const [editableBody, setEditableBody] = useState("");

  const { data: preview, isLoading } = useQuery<{
    from: string;
    to: string;
    cc: string[];
    subject: string;
    body: string;
    rfiLabel: string;
  }>({
    queryKey: ["/api/rfis", rfiId, "preview-email"],
    queryFn: async () => {
      const res = await apiRequest("POST", `/api/rfis/${rfiId}/preview-email`);
      return res.json();
    },
  });

  useEffect(() => {
    if (preview) {
      setEditableBody(preview.body);
    }
  }, [preview]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/rfis/${rfiId}/send`, { customBody: editableBody });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfis", rfiId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "rfis"] });
      toast({ title: "RFI Sent", description: "The RFI has been sent via email with the PDF attached." });
      onSent();
    },
    onError: (err: any) => {
      toast({ title: "Send Failed", description: err.message || "Failed to send RFI.", variant: "destructive" });
    },
  });

  if (isLoading || !preview) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-from-preview">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h2 className="text-lg font-semibold">Email Preview - {preview.rfiLabel}</h2>
      </div>

      <Card className="p-4 space-y-3">
        <div>
          <p className="text-sm text-muted-foreground">From</p>
          <p className="text-sm font-medium" data-testid="text-preview-from">{preview.from}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">To</p>
          <p className="text-sm font-medium" data-testid="text-preview-to">{preview.to}</p>
        </div>
        {preview.cc.length > 0 && (
          <div>
            <p className="text-sm text-muted-foreground">CC</p>
            <p className="text-sm font-medium" data-testid="text-preview-cc">{preview.cc.join(", ")}</p>
          </div>
        )}
        <div>
          <p className="text-sm text-muted-foreground">Subject</p>
          <p className="text-sm font-medium" data-testid="text-preview-subject">{preview.subject}</p>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <Label className="font-semibold">Email Body</Label>
          <p className="text-xs text-muted-foreground">You can edit the body text below before sending</p>
        </div>
        <Textarea
          value={editableBody}
          onChange={(e) => setEditableBody(e.target.value)}
          className="min-h-[300px] font-mono text-sm"
          data-testid="textarea-email-body"
        />
      </Card>

      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          <Paperclip className="w-4 h-4 inline mr-1" />
          The RFI PDF document and any attached files will be included as email attachments.
        </p>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onBack} data-testid="button-cancel-send">
          Cancel
        </Button>
        <Button
          onClick={() => sendMutation.mutate()}
          disabled={sendMutation.isPending}
          data-testid="button-confirm-send"
        >
          {sendMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          Send Email
        </Button>
      </div>
    </div>
  );
}

function RfiDetailView({ rfiId, project, onBack, onEdit, onPreviewSend }: {
  rfiId: number;
  project: Project;
  onBack: () => void;
  onEdit: () => void;
  onPreviewSend: () => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: rfi, isLoading } = useQuery<Rfi>({
    queryKey: ["/api/rfis", rfiId],
  });

  const { data: conversation = [], isLoading: conversationLoading } = useQuery<any[]>({
    queryKey: ["/api/rfis", rfiId, "conversation"],
    enabled: !!rfi && rfi.status !== "draft" && !!rfi.outlookConversationId,
  });

  const checkRepliesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/rfis/${rfiId}/check-replies`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfis", rfiId] });
      queryClient.invalidateQueries({ queryKey: ["/api/rfis", rfiId, "conversation"] });
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
        <div className="flex items-center gap-2 flex-wrap">
          {isDraft && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onEdit}
                data-testid="button-edit-rfi"
              >
                <Pencil className="w-4 h-4 mr-1" />
                Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    data-testid="button-delete-rfi"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete RFI?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete RFI-{String(rfi.rfiNumber).padStart(3, "0")}? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-delete"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                onClick={onPreviewSend}
                data-testid="button-send-rfi"
              >
                <Eye className="w-4 h-4 mr-2" />
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
            <Mail className="w-4 h-4" />
            Email Conversation ({conversation.length})
          </h3>
          {conversationLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversation.length === 0 ? (
            <div className="text-center py-4">
              <Clock className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No emails in conversation yet. Click "Check Replies" to look for new responses.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {conversation.map((msg: any, idx: number) => {
                const isOriginal = msg.id === rfi.outlookMessageId;
                const isSentByUser = msg.from?.email?.toLowerCase() === rfi.sentByEmail?.toLowerCase();
                return (
                  <ConversationMessage
                    key={msg.id || idx}
                    msg={msg}
                    isOriginal={isOriginal}
                    isSentByUser={isSentByUser}
                    rfiId={rfiId}
                  />
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function ConversationMessage({ msg, isOriginal, isSentByUser, rfiId }: {
  msg: any;
  isOriginal: boolean;
  isSentByUser: boolean;
  rfiId: number;
}) {
  const [showAttachments, setShowAttachments] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const { data: attachments = [], isLoading: attachmentsLoading } = useQuery<any[]>({
    queryKey: ["/api/rfis", rfiId, "message-attachments", msg.id],
    enabled: showAttachments && msg.hasAttachments,
  });

  return (
    <div
      className={`p-3 rounded-md space-y-2 ${isSentByUser ? "bg-primary/5 border border-primary/20" : "bg-muted/50"}`}
      data-testid={`conversation-msg-${msg.id}`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm">{msg.from?.name || msg.from?.email || "Unknown"}</p>
          {isOriginal && <Badge variant="secondary" className="text-xs">Original</Badge>}
          {isSentByUser && !isOriginal && <Badge variant="outline" className="text-xs">Sent</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{formatDate(msg.receivedAt)}</p>
      </div>
      <div className="text-sm">
        {expanded ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: msg.bodyHtml || msg.bodyPreview }}
          />
        ) : (
          <p className="line-clamp-3">{msg.bodyPreview}</p>
        )}
        {(msg.bodyHtml || (msg.bodyPreview && msg.bodyPreview.length > 200)) && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-auto py-1 px-2 text-xs"
            onClick={() => setExpanded(!expanded)}
            data-testid={`button-expand-msg-${msg.id}`}
          >
            {expanded ? "Show Less" : "Show More"}
          </Button>
        )}
      </div>
      {msg.hasAttachments && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto py-1 px-2 text-xs"
            onClick={() => setShowAttachments(!showAttachments)}
            data-testid={`button-show-attachments-${msg.id}`}
          >
            <Paperclip className="w-3 h-3 mr-1" />
            {showAttachments ? "Hide Attachments" : "View Attachments"}
          </Button>
          {showAttachments && (
            <div className="mt-2 space-y-1">
              {attachmentsLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : attachments.length === 0 ? (
                <p className="text-xs text-muted-foreground">No downloadable attachments</p>
              ) : (
                attachments.map((att: any) => (
                  <a
                    key={att.id}
                    href={`/api/rfis/${rfiId}/message-attachments/${msg.id}/${att.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 rounded-md bg-background hover-elevate text-sm"
                    data-testid={`link-attachment-${att.id}`}
                  >
                    <Download className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{att.name}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {att.size ? `${(att.size / 1024).toFixed(1)} KB` : ""}
                    </span>
                  </a>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
