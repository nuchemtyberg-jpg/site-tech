import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Clock, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export default function PendingAccessPage() {
  const { user, logout, isLoggingOut, isRejected } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-8">
        <Card className="border-border shadow-xl">
          <CardHeader className="space-y-1 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <Clock className={`w-8 h-8 ${isRejected ? 'text-destructive' : 'text-primary'}`} />
            </div>
            <CardTitle className="text-2xl font-bold">
              {isRejected ? "Access Denied" : "Access Pending"}
            </CardTitle>
            <CardDescription>
              {isRejected 
                ? "Your access request has been denied. Please contact an administrator."
                : "Your account is awaiting administrator approval."
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-sm text-muted-foreground mb-2">Signed in as</p>
              <p className="font-medium">{user?.email}</p>
              {user?.firstName && (
                <p className="text-sm text-muted-foreground">{user.firstName} {user.lastName}</p>
              )}
            </div>

            {!isRejected && (
              <div className="text-center text-sm text-muted-foreground">
                <p>An administrator will review your access request shortly.</p>
                <p className="mt-2">You will be able to access the system once approved.</p>
              </div>
            )}

            <Button
              variant="outline"
              className="w-full"
              onClick={() => logout()}
              disabled={isLoggingOut}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {isLoggingOut ? "Signing out..." : "Sign out"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
