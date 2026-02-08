import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check, ExternalLink, Mail, Server, Globe, ArrowRight } from "lucide-react";
import { useState } from "react";

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between gap-3 p-3 bg-muted rounded-md">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-mono truncate" data-testid={`text-${label.toLowerCase().replace(/\s+/g, '-')}`}>
          {value}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleCopy}
        data-testid={`button-copy-${label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
      </Button>
    </div>
  );
}

export default function EmailSetup() {
  const { data, isLoading } = useQuery<{
    webhookUrl: string;
    domain: string;
    mxRecord: string;
    mxPriority: number;
  }>({
    queryKey: ["/api/admin/email-setup"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">Project Email Setup</h1>
        <p className="text-muted-foreground mt-1">
          Configure inbound email so your team can CC project-specific email addresses
          on their correspondence for automatic tracking.
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Badge>Step 1</Badge>
          <h2 className="font-semibold">Add MX Record in GoDaddy</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Add an MX record for the subdomain <strong>{data?.domain}</strong> in your GoDaddy DNS settings.
          This tells email servers to route emails to SendGrid for processing.
        </p>
        <div className="space-y-2">
          <CopyField label="Subdomain" value={data?.domain || ""} />
          <CopyField label="MX Server" value={data?.mxRecord || ""} />
          <CopyField label="Priority" value={String(data?.mxPriority || 10)} />
        </div>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>In GoDaddy DNS Management:</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Go to your domain's DNS settings</li>
            <li>Add a new MX record</li>
            <li>Set the <strong>Host</strong> to <strong>projects</strong></li>
            <li>Set the <strong>Points to</strong> value to <strong>{data?.mxRecord}</strong></li>
            <li>Set <strong>Priority</strong> to <strong>{data?.mxPriority}</strong></li>
            <li>Save the record</li>
          </ol>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Badge>Step 2</Badge>
          <h2 className="font-semibold">Configure SendGrid Inbound Parse</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          In your SendGrid dashboard, set up Inbound Parse to forward received emails to your app's webhook.
        </p>
        <CopyField label="Webhook URL" value={data?.webhookUrl || ""} />
        <div className="text-sm text-muted-foreground space-y-1">
          <p>In SendGrid Dashboard:</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Go to <strong>Settings</strong> <ArrowRight className="w-3 h-3 inline" /> <strong>Inbound Parse</strong></li>
            <li>Click <strong>Add Host & URL</strong></li>
            <li>For <strong>Receiving Domain</strong>, enter <strong>{data?.domain}</strong></li>
            <li>For <strong>Destination URL</strong>, paste the webhook URL above</li>
            <li>Leave "Check incoming emails for spam" unchecked</li>
            <li>Leave "POST the raw, full MIME message" unchecked</li>
            <li>Click <strong>Add</strong></li>
          </ol>
        </div>
        <a
          href="https://app.sendgrid.com/settings/parse"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="outline" data-testid="button-open-sendgrid">
            <ExternalLink className="w-4 h-4 mr-2" />
            Open SendGrid Settings
          </Button>
        </a>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Badge>Step 3</Badge>
          <h2 className="font-semibold">Start Using Project Emails</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Once the MX record and SendGrid are configured, each project will have a unique email address.
          Your team can CC this address on emails related to that project, and they'll automatically
          appear in the project's Communications tab.
        </p>
        <div className="flex items-start gap-3 p-3 bg-muted rounded-md">
          <Mail className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Example workflow:</p>
            <p className="text-muted-foreground mt-1">
              When emailing a customer about "Highland Ridge" project, CC the project email
              (e.g., <span className="font-mono">highland-ridge-42@{data?.domain}</span>).
              The email will appear in that project's Communications tab for everyone on the team to see.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
