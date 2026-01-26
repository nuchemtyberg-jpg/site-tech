import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Truck } from "lucide-react";

export default function AuthPage() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left: Branding */}
      <div className="hidden lg:flex flex-col justify-between bg-zinc-900 p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:40px_40px]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        
        <div className="relative z-10 flex items-center gap-2">
           <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
             <span className="font-display font-bold text-xl text-primary-foreground">ST</span>
           </div>
           <span className="font-display font-bold text-2xl text-white tracking-wide">SiteTech</span>
        </div>

        <div className="relative z-10 max-w-lg">
          <h1 className="font-display text-5xl font-bold text-white leading-tight mb-4">
            Sitework management,<br/>simplified.
          </h1>
          <p className="text-zinc-400 text-lg">
            The all-in-one platform for sitework companies. Track equipment, manage crews, schedule projects, and keep customers informed.
          </p>
        </div>

        <div className="relative z-10 text-zinc-500 text-sm">
          &copy; 2024 SiteTech. All rights reserved.
        </div>
      </div>

      {/* Right: Login */}
      <div className="flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:hidden mb-8">
             <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center mx-auto mb-4">
               <span className="font-display font-bold text-2xl text-primary-foreground">ST</span>
             </div>
             <h1 className="text-2xl font-bold">SiteTech</h1>
          </div>

          <Card className="border-border shadow-xl">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-bold text-center">Sign in</CardTitle>
              <CardDescription className="text-center">
                Access your dashboard and project tools
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button 
                className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20" 
                size="lg"
                onClick={() => window.location.href = "/api/login"}
                data-testid="button-login"
              >
                Log in with Replit
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    Secure Access
                  </span>
                </div>
              </div>
              <div className="text-center text-sm text-muted-foreground pt-4">
                <Truck className="w-12 h-12 mx-auto mb-2 text-primary/20" />
                <p>Authorized personnel only.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
