import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Mail,
  Search,
  RefreshCw,
  Copy,
  Check,
  Paperclip,
  ChevronLeft,
  Download,
  AlertCircle,
  Link2,
  ArrowUpRight,
  ArrowDownLeft,
  Users,
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import type { Project, ProjectEmail, ProjectEmailAttachment } from "@shared/schema";

interface CommunicationsTabProps {
  project: Project;
}

type FilterType = "all" | "external" | "internal";

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CommunicationsTab({ project }: CommunicationsTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmailId, setSelectedEmailId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: outlookConfig } = useQuery<{ configured: boolean }>({
    queryKey: ["/api/outlook/configured"],
  });

  const { data: connectionData, isLoading: isConnectionLoading } = useQuery<{
    connected: boolean;
    emailAddress?: string;
    status?: string;
    lastSyncAt?: string;
    connectedByName?: string;
  }>({
    queryKey: ["/api/projects", project.id, "email-connection"],
  });

  const { data: emailsData, isLoading: isEmailsLoading } = useQuery<{
    emails: ProjectEmail[];
    total: number;
  }>({
    queryKey: ["/api/projects", project.id, "emails", { filter, search: searchQuery }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("filter", filter);
      if (searchQuery) params.set("search", searchQuery);
      params.set("limit", "100");
      const res = await fetch(`/api/projects/${project.id}/emails?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch emails");
      return res.json();
    },
    enabled: connectionData?.connected === true,
  });

  const { data: selectedEmail, isLoading: isEmailDetailLoading } = useQuery<
    ProjectEmail & { attachments: ProjectEmailAttachment[] }
  >({
    queryKey: ["/api/projects", project.id, "emails", selectedEmailId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${project.id}/emails/${selectedEmailId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch email");
      return res.json();
    },
    enabled: !!selectedEmailId,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/${project.id}/emails/sync`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "emails"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "email-connection"] });
      toast({
        title: "Emails synced",
        description: `${data.synced} new email${data.synced !== 1 ? "s" : ""} synced${data.errors > 0 ? `, ${data.errors} error${data.errors !== 1 ? "s" : ""}` : ""}`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Sync failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/outlook/auth/${project.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to start connection");
      const data = await res.json();
      return data.authUrl;
    },
    onSuccess: (authUrl: string) => {
      window.location.href = authUrl;
    },
    onError: (err: Error) => {
      toast({
        title: "Connection failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleCopyEmail = () => {
    if (connectionData?.emailAddress) {
      navigator.clipboard.writeText(connectionData.emailAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isConnectionLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!outlookConfig?.configured) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="bg-muted rounded-full p-4 mb-4">
          <AlertCircle className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Outlook Not Configured</h3>
        <p className="text-muted-foreground text-center max-w-md">
          To use the communications feature, Outlook credentials need to be set up.
          Contact your administrator to configure the OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET,
          and OUTLOOK_TENANT_ID.
        </p>
      </div>
    );
  }

  if (!connectionData?.connected) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="bg-muted rounded-full p-4 mb-4">
          <Mail className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Connect Project Email</h3>
        <p className="text-muted-foreground text-center max-w-md mb-6">
          Connect an Outlook email account dedicated to this project. Your team can CC this
          address on customer emails for shared visibility, or email it directly for internal
          project discussions.
        </p>
        <Button
          onClick={() => connectMutation.mutate()}
          disabled={connectMutation.isPending}
          data-testid="button-connect-email"
        >
          <Link2 className="w-4 h-4 mr-2" />
          {connectMutation.isPending ? "Connecting..." : "Connect Outlook Account"}
        </Button>
      </div>
    );
  }

  if (connectionData.status === "expired") {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="bg-destructive/10 rounded-full p-4 mb-4">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Connection Expired</h3>
        <p className="text-muted-foreground text-center max-w-md mb-6">
          The Outlook connection for this project has expired and needs to be re-authorized.
        </p>
        <Button
          onClick={() => connectMutation.mutate()}
          disabled={connectMutation.isPending}
          data-testid="button-reconnect-email"
        >
          <Link2 className="w-4 h-4 mr-2" />
          {connectMutation.isPending ? "Reconnecting..." : "Reconnect Outlook"}
        </Button>
      </div>
    );
  }

  if (selectedEmailId && selectedEmail) {
    return (
      <EmailDetailView
        email={selectedEmail}
        projectId={project.id}
        onBack={() => setSelectedEmailId(null)}
      />
    );
  }

  if (selectedEmailId && isEmailDetailLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const emails = emailsData?.emails || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-md min-w-0">
            <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-sm truncate" data-testid="text-project-email">
              {connectionData.emailAddress}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={handleCopyEmail}
              data-testid="button-copy-email"
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            </Button>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          data-testid="button-sync-emails"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          {syncMutation.isPending ? "Syncing..." : "Sync"}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by subject or sender..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-emails"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "external", "internal"] as FilterType[]).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              data-testid={`button-filter-${f}`}
            >
              {f === "all" ? "All" : f === "external" ? "External" : "Internal"}
            </Button>
          ))}
        </div>
      </div>

      {connectionData.lastSyncAt && (
        <p className="text-xs text-muted-foreground">
          Last synced: {format(new Date(connectionData.lastSyncAt), "MMM d, yyyy h:mm a")}
        </p>
      )}

      {isEmailsLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : emails.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Mail className="w-12 h-12 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            {searchQuery
              ? "No emails match your search"
              : filter !== "all"
                ? `No ${filter} emails yet`
                : "No emails synced yet. Click Sync to pull in the latest emails."}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {emails.map((email) => (
            <EmailListItem
              key={email.id}
              email={email}
              onClick={() => setSelectedEmailId(email.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmailListItem({
  email,
  onClick,
}: {
  email: ProjectEmail;
  onClick: () => void;
}) {
  return (
    <Card
      className="p-3 cursor-pointer hover-elevate"
      onClick={onClick}
      data-testid={`email-item-${email.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full p-1.5 bg-muted shrink-0 mt-0.5">
          {email.isInternal ? (
            <Users className="w-4 h-4 text-muted-foreground" />
          ) : (
            <Mail className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">
              {email.fromName || email.fromEmail}
            </span>
            <Badge variant={email.isInternal ? "secondary" : "outline"} className="text-xs shrink-0">
              {email.isInternal ? "Internal" : "External"}
            </Badge>
            {email.hasAttachments && (
              <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            )}
          </div>
          <p className="text-sm font-medium truncate mt-0.5" data-testid={`text-email-subject-${email.id}`}>
            {email.subject || "(No subject)"}
          </p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {email.bodyPreview}
          </p>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          {email.receivedAt
            ? format(new Date(email.receivedAt), "MMM d, h:mm a")
            : ""}
        </span>
      </div>
    </Card>
  );
}

function EmailDetailView({
  email,
  projectId,
  onBack,
}: {
  email: ProjectEmail & { attachments: ProjectEmailAttachment[] };
  projectId: number;
  onBack: () => void;
}) {
  const toEmails = email.toEmails || [];
  const ccEmails = email.ccEmails || [];

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        onClick={onBack}
        className="mb-2"
        data-testid="button-back-to-emails"
      >
        <ChevronLeft className="w-4 h-4 mr-1" />
        Back to emails
      </Button>

      <Card className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold" data-testid="text-email-detail-subject">
              {email.subject || "(No subject)"}
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant={email.isInternal ? "secondary" : "outline"}>
                {email.isInternal ? "Internal" : "External"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {email.receivedAt
                  ? format(new Date(email.receivedAt), "MMMM d, yyyy 'at' h:mm a")
                  : ""}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2 text-sm border-b pb-4 mb-4">
          <div className="flex gap-2">
            <span className="text-muted-foreground w-12 shrink-0">From:</span>
            <span>
              {email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail}
            </span>
          </div>
          {toEmails.length > 0 && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-12 shrink-0">To:</span>
              <span className="break-all">{toEmails.join(", ")}</span>
            </div>
          )}
          {ccEmails.length > 0 && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-12 shrink-0">CC:</span>
              <span className="break-all">{ccEmails.join(", ")}</span>
            </div>
          )}
        </div>

        {email.bodyHtml ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none overflow-x-auto"
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(email.bodyHtml, {
                ALLOWED_TAGS: [
                  "p", "br", "div", "span", "a", "b", "strong", "i", "em", "u",
                  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
                  "table", "thead", "tbody", "tr", "td", "th", "img", "blockquote",
                  "pre", "code", "hr", "sub", "sup",
                ],
                ALLOWED_ATTR: ["href", "src", "alt", "title", "style", "class", "width", "height", "target"],
              }),
            }}
            data-testid="text-email-body"
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap" data-testid="text-email-body">
            {email.bodyPreview || "(No content)"}
          </p>
        )}

        {email.attachments && email.attachments.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Paperclip className="w-4 h-4" />
              Attachments ({email.attachments.length})
            </h3>
            <div className="space-y-2">
              {email.attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between gap-3 p-2 bg-muted rounded-md"
                  data-testid={`attachment-${att.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">{att.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatFileSize(att.size)}
                    </span>
                  </div>
                  <a
                    href={`/api/projects/${projectId}/emails/${email.id}/attachments/${att.id}/download`}
                    className="shrink-0"
                    download
                  >
                    <Button variant="ghost" size="icon" data-testid={`button-download-attachment-${att.id}`}>
                      <Download className="w-4 h-4" />
                    </Button>
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
