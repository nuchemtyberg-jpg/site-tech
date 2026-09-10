import { useAuth } from "@/hooks/use-auth";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useEffect, useCallback } from "react";
import { DocumentCategoriesSettings } from "@/components/settings/DocumentCategoriesSettings";
import { ScopeCatalogSettings } from "@/components/settings/ScopeCatalogSettings";
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
  User, 
  Mail, 
  Shield, 
  CheckCircle2, 
  XCircle, 
  Settings as SettingsIcon,
  Loader2,
  Link as LinkIcon,
  Unlink
} from "lucide-react";

interface OutlookStatus {
  connected: boolean;
  email: string | null;
  source: "user" | "replit" | null;
  canConnect: boolean;
}

export default function Settings() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: outlookStatus, isLoading: outlookLoading } = useQuery<OutlookStatus>({
    queryKey: ["/api/outlook/status"],
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/outlook/user-connect");
      const data = await res.json();
      return data.url as string;
    },
    onSuccess: (url) => {
      const popup = window.open(url, "outlook_connect", "width=600,height=700,scrollbars=yes");
      if (!popup) {
        window.location.href = url;
      }
    },
    onError: (err: any) => {
      toast({
        title: "Connection Failed",
        description: err.message || "Could not start Outlook connection. Please try again.",
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/outlook/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/outlook/status"] });
      toast({
        title: "Disconnected",
        description: "Your Outlook account has been disconnected.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to disconnect. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleOAuthCallback = useCallback((event: MessageEvent) => {
    if (event.data?.type === "outlook_user_callback") {
      queryClient.invalidateQueries({ queryKey: ["/api/outlook/status"] });
      if (event.data.success) {
        toast({
          title: "Connected",
          description: "Your Outlook account has been connected successfully.",
        });
      } else {
        toast({
          title: "Connection Failed",
          description: "Could not connect your Outlook account. Please try again.",
          variant: "destructive",
        });
      }
    }
  }, [queryClient, toast]);

  useEffect(() => {
    window.addEventListener("message", handleOAuthCallback);
    return () => window.removeEventListener("message", handleOAuthCallback);
  }, [handleOAuthCallback]);

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

        {isAdmin && <DocumentCategoriesSettings />}
        {isAdmin && <ScopeCatalogSettings />}

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

                {outlookStatus.source === "user" && (
                  <>
                    <Separator />
                    <div className="flex items-center gap-2 flex-wrap">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            className="flex-1 gap-2"
                            data-testid="button-disconnect-outlook"
                          >
                            <Unlink className="w-4 h-4" />
                            Disconnect
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Disconnect Outlook?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove your Outlook connection. You won't be able to send RFIs via email until you reconnect.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => disconnectMutation.mutate()}
                              data-testid="button-confirm-disconnect"
                            >
                              Disconnect
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      {outlookStatus.canConnect && (
                        <Button
                          variant="outline"
                          className="flex-1 gap-2"
                          onClick={() => connectMutation.mutate()}
                          disabled={connectMutation.isPending}
                          data-testid="button-reconnect-outlook"
                        >
                          {connectMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <LinkIcon className="w-4 h-4" />
                          )}
                          Switch Account
                        </Button>
                      )}
                    </div>
                  </>
                )}

                {outlookStatus.source === "replit" && (
                  <>
                    <Separator />
                    <p className="text-xs text-muted-foreground">
                      Connected via workspace integration. To switch accounts, use the Connect button below.
                    </p>
                    {outlookStatus.canConnect && (
                      <Button
                        variant="outline"
                        className="w-full gap-2"
                        onClick={() => connectMutation.mutate()}
                        disabled={connectMutation.isPending}
                        data-testid="button-connect-outlook-override"
                      >
                        {connectMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <LinkIcon className="w-4 h-4" />
                        )}
                        Connect Different Account
                      </Button>
                    )}
                  </>
                )}
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

                {outlookStatus?.canConnect ? (
                  <Button
                    className="w-full gap-2"
                    onClick={() => connectMutation.mutate()}
                    disabled={connectMutation.isPending}
                    data-testid="button-connect-outlook"
                  >
                    {connectMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <LinkIcon className="w-4 h-4" />
                    )}
                    Connect Outlook Account
                  </Button>
                ) : (
                  <div className="text-sm text-muted-foreground space-y-2">
                    <p>Outlook integration is not configured yet. Please contact your administrator to set up the Microsoft OAuth credentials.</p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
