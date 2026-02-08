import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check, ExternalLink, Mail, ArrowRight } from "lucide-react";
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
    mxRecord2: string;
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
          Configure inbound email routing through Mailgun so your team can CC project-specific
          email addresses on their correspondence for automatic tracking.
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Badge>Step 1</Badge>
          <h2 className="font-semibold">Add Domain in Mailgun</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Add <strong>{data?.domain}</strong> as a domain in your Mailgun account. This allows
          Mailgun to receive emails sent to project addresses.
        </p>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>In Mailgun Dashboard:</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Go to <strong>Sending</strong> <ArrowRight className="w-3 h-3 inline" /> <strong>Domains</strong></li>
            <li>Click <strong>Add New Domain</strong></li>
            <li>Enter <strong>{data?.domain}</strong></li>
            <li>Follow Mailgun's verification steps (TXT records for SPF and DKIM)</li>
          </ol>
        </div>
        <a
          href="https://app.mailgun.com/mg/sending/domains"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="outline" data-testid="button-open-mailgun-domains">
            <ExternalLink className="w-4 h-4 mr-2" />
            Open Mailgun Domains
          </Button>
        </a>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Badge>Step 2</Badge>
          <h2 className="font-semibold">Add MX Records in GoDaddy</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Add MX records for <strong>{data?.domain}</strong> in your GoDaddy DNS settings.
          This tells email servers to route emails to Mailgun for processing.
        </p>
        <div className="space-y-2">
          <CopyField label="Subdomain" value={data?.domain || ""} />
          <CopyField label="MX Server 1" value={data?.mxRecord || ""} />
          <CopyField label="MX Server 2" value={data?.mxRecord2 || ""} />
          <CopyField label="Priority" value={String(data?.mxPriority || 10)} />
        </div>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>In GoDaddy DNS Management:</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Go to your domain's DNS settings</li>
            <li>Add two new MX records</li>
            <li>For both, set the <strong>Host</strong> to <strong>email</strong></li>
            <li>Set first record's <strong>Points to</strong> to <strong>{data?.mxRecord}</strong></li>
            <li>Set second record's <strong>Points to</strong> to <strong>{data?.mxRecord2}</strong></li>
            <li>Set <strong>Priority</strong> to <strong>{data?.mxPriority}</strong> for both</li>
            <li>Save both records</li>
          </ol>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Badge>Step 3</Badge>
          <h2 className="font-semibold">Create Inbound Route in Mailgun</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          In Mailgun, create an inbound route that forwards received emails to your app's webhook.
        </p>
        <CopyField label="Webhook URL" value={data?.webhookUrl || ""} />
        <div className="text-sm text-muted-foreground space-y-1">
          <p>In Mailgun Dashboard:</p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Go to <strong>Receiving</strong> <ArrowRight className="w-3 h-3 inline" /> <strong>Create Route</strong></li>
            <li>Set <strong>Expression Type</strong> to <strong>Match Recipient</strong></li>
            <li>Set the pattern to <strong>.*@{data?.domain}</strong> (catch all for the subdomain)</li>
            <li>Under <strong>Actions</strong>, check <strong>Forward</strong></li>
            <li>Paste the webhook URL above as the forward destination</li>
            <li>Set <strong>Priority</strong> to <strong>0</strong></li>
            <li>Click <strong>Create Route</strong></li>
          </ol>
        </div>
        <a
          href="https://app.mailgun.com/mg/receiving/routes"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="outline" data-testid="button-open-mailgun-routes">
            <ExternalLink className="w-4 h-4 mr-2" />
            Open Mailgun Routes
          </Button>
        </a>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Badge>Step 4</Badge>
          <h2 className="font-semibold">Start Using Project Emails</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Once the domain and routes are configured, each project will have a unique email address.
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
