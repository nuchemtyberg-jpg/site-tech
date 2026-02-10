import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  User, 
  Mail, 
  Shield, 
  CheckCircle2, 
  XCircle, 
  Settings as SettingsIcon,
  Loader2,
  RefreshCw
} from "lucide-react";

export default function Settings() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const { data: outlookStatus, isLoading: outlookLoading } = useQuery<{ connected: boolean; email: string | null }>({
    queryKey: ["/api/outlook/status"],
  });

  const initials = [user?.firstName, user?.lastName]
    .filter(Boolean)
    .map(n => n!.charAt(0).toUpperCase())
    .join("") || "U";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <SettingsIcon className="w-6 h-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-settings-title">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your account and integrations</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card data-testid="card-profile">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Profile
            </CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16" data-testid="img-profile-avatar">
                <AvatarImage src={user?.profileImageUrl || undefined} alt="Profile" />
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold truncate" data-testid="text-profile-name">
                  {user?.firstName || ""} {user?.lastName || ""}
                </p>
                <p className="text-sm text-muted-foreground truncate" data-testid="text-profile-email">
                  {user?.email}
                </p>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm text-muted-foreground">Role</span>
                <Badge variant={isAdmin ? "default" : "secondary"} data-testid="badge-user-role">
                  <Shield className="w-3 h-3 mr-1" />
                  {isAdmin ? "Administrator" : "Team Member"}
                </Badge>
              </div>
              {user?.email && (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground">Email</span>
                  <span className="text-sm font-medium truncate max-w-[200px]" data-testid="text-profile-email-detail">
                    {user.email}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-outlook-connection">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Outlook Connection
            </CardTitle>
            <CardDescription>
              Connect your Microsoft Outlook account to send RFIs and emails directly from your inbox
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {outlookLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-outlook-loading">
                <Loader2 className="w-4 h-4 animate-spin" />
                Checking connection status...
              </div>
            ) : outlookStatus?.connected ? (
              <>
                <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400" data-testid="text-outlook-connected">
                      Connected
                    </p>
                    {outlookStatus.email && (
                      <p className="text-xs text-muted-foreground truncate" data-testid="text-outlook-email">
                        {outlookStatus.email}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>Your Outlook account is connected and ready to use for:</p>
                  <ul className="list-disc list-inside space-y-1 text-xs ml-2">
                    <li>Sending RFIs from your inbox</li>
                    <li>Tracking RFI email replies</li>
                  </ul>
                </div>
                <Separator />
                <p className="text-xs text-muted-foreground">
                  To disconnect or change the connected account, use the Outlook integration panel in the workspace tools.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 p-3 rounded-md bg-muted border border-border">
                  <XCircle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium" data-testid="text-outlook-not-connected">
                      Not Connected
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Connect your Outlook to enable email features
                    </p>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>To connect your Outlook account:</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs ml-2">
                    <li>Open the <strong>Outlook</strong> integration in the workspace tools panel (left side)</li>
                    <li>Click <strong>Connect</strong> and sign in with your Microsoft account</li>
                    <li>Grant the requested permissions</li>
                    <li>Return here to verify the connection</li>
                  </ol>
                </div>
                <Button 
                  variant="outline" 
                  className="w-full gap-2" 
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/outlook/status"] })}
                  data-testid="button-refresh-outlook-status"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh Connection Status
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
