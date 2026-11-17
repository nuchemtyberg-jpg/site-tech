import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  LayoutDashboard, 
  FolderKanban, 
  Calendar, 
  Truck, 
  Users,
  HardHat,
  LogOut, 
  Menu,
  X,
  User,
  Receipt,
  Settings,
  ChevronRight,
  Files,
  BarChart3,
  ClipboardCheck,
  Target
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { TakeoffNavigation } from "@/components/estimating/TakeoffNavigation";
import siteTechLogo from "@assets/Logo_1770600587313.png";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout, isAdmin, canEstimate } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/my-work", label: "My Work", icon: ClipboardCheck },
    { href: "/projects", label: "Projects", icon: FolderKanban },
    { href: "/bidding", label: "Bidding", icon: Target },
    { href: "/customers", label: "Customers", icon: Users },
    { href: "/schedule", label: "Schedule", icon: Calendar },
    { href: "/equipment", label: "Equipment", icon: Truck },
    ...(!isAdmin && canEstimate ? [{ href: "/admin/settings", label: "Admin Settings", icon: Settings }] : []),
  ];
  
  const adminItems = [
    { href: "/admin/settings", label: "Admin Settings", icon: Settings },
    { href: "/admin/billing", label: "Billing", icon: Receipt },
    { href: "/admin/reports", label: "Reports", icon: BarChart3 },
    { href: "/admin/documents", label: "Documents", icon: Files },
    { href: "/employees", label: "Employees", icon: HardHat },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Mobile Fixed Menu Button (Top Right) */}
      <div className="md:hidden fixed top-4 right-4 z-50 flex items-center gap-2 pl-4 pb-4 safe-area-inset-top" data-mobile-menu-container>
        <div className="bg-background/95 backdrop-blur rounded-lg shadow-lg">
          <NotificationBell />
        </div>
        <ThemeToggle />
        <Button 
          variant="default" 
          size="icon" 
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="min-h-[44px] min-w-[44px] shadow-lg"
          data-testid="button-mobile-menu"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      <div className="flex flex-1 md:flex-row">
        {/* Desktop Sidebar Navigation */}
        <aside className={cn(
          "hidden md:flex fixed inset-y-0 left-0 z-50 bg-card border-r border-border w-64 flex-col"
        )}>
          <div className="p-6 pr-4 flex items-center gap-3">
            <img src={siteTechLogo} alt="SiteTech" className="h-10 w-auto" data-testid="img-logo-sidebar" />
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-xs text-muted-foreground uppercase tracking-widest">Sitework Management</span>
            </div>
            <NotificationBell />
          </div>

          <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
            {navItems.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href}>
                  <div 
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer group min-h-[44px]",
                      isActive 
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25" 
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className={cn("w-5 h-5 flex-shrink-0", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
                    {item.label}
                  </div>
                </Link>
              );
            })}
            
            <TakeoffNavigation />
            {isAdmin && (
              <>
                <div className="my-4 px-4">
                  <div className="h-px bg-border" />
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mt-4 mb-2">Admin</p>
                </div>
                {adminItems.map((item) => {
                  const isActive = location.startsWith(item.href);
                  return (
                    <Link key={item.href} href={item.href} aria-current={isActive ? "page" : undefined} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                      <div 
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer group min-h-[44px]",
                          isActive 
                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25" 
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                        data-testid={`link-admin-${item.href.split("/").pop()}`}
                      >
                        <item.icon className={cn("w-5 h-5 flex-shrink-0", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
                        {item.label}
                      </div>
                    </Link>
                  );
                })}
              </>
            )}
          </nav>

          <div className="p-4 border-t border-border mt-auto space-y-2">
            <Link href="/settings">
              <div 
                className={cn(
                  "flex items-center justify-between gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all duration-200 min-h-[44px]",
                  location === "/settings"
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                    : "hover:bg-muted"
                )}
                data-testid="link-user-settings"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center border border-border flex-shrink-0">
                    {user?.profileImageUrl ? (
                      <img src={user.profileImageUrl} alt="User" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <User className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{user?.firstName || 'User'}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                </div>
                <Settings className={cn("w-4 h-4 flex-shrink-0", location === "/settings" ? "text-primary-foreground" : "text-muted-foreground")} />
              </div>
            </Link>
            <div className="flex items-center justify-between gap-2">
              <Button 
                variant="outline" 
                className="flex-1 justify-start gap-2 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 min-h-[44px]"
                onClick={() => logout()}
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4" />
                Log Out
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 md:ml-64 min-h-screen bg-background relative overflow-x-hidden flex flex-col">
          <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" 
               style={{ 
                 backgroundImage: `linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)`,
                 backgroundSize: '40px 40px' 
               }} 
          />
          <div className={cn(
            "relative z-10 w-full overflow-x-hidden flex-1 flex flex-col",
            location === "/schedule" ? "p-3 md:p-4" : "max-w-7xl mx-auto p-4 md:p-8"
          )}>
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Slide-out Menu (for extra options) */}
      {mobileMenuOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 w-72 bg-card border-l border-border z-50 md:hidden flex flex-col safe-area-inset-top">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <img src={siteTechLogo} alt="SiteTech" className="h-8 w-auto" data-testid="img-logo-mobile" />
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setMobileMenuOpen(false)}
                className="min-h-[44px] min-w-[44px]"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
              {navItems.map((item) => {
                const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href}>
                    <div 
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer min-h-[44px]",
                        isActive 
                          ? "bg-primary text-primary-foreground" 
                          : "text-foreground hover:bg-muted"
                      )}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      {item.label}
                    </div>
                  </Link>
                );
              })}
              
              <TakeoffNavigation onNavigate={() => setMobileMenuOpen(false)} />
              {isAdmin && (
                <>
                  <div className="my-4">
                    <div className="h-px bg-border" />
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mt-4 mb-2 px-4">Admin</p>
                  </div>
                  {adminItems.map((item) => {
                    const isActive = location.startsWith(item.href);
                    return (
                      <Link key={item.href} href={item.href} aria-current={isActive ? "page" : undefined} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        <div 
                          className={cn(
                            "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer min-h-[44px]",
                            isActive 
                              ? "bg-primary text-primary-foreground" 
                              : "text-foreground hover:bg-muted"
                          )}
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <item.icon className="w-5 h-5 flex-shrink-0" />
                          {item.label}
                        </div>
                      </Link>
                    );
                  })}
                </>
              )}
            </nav>

            <div className="p-4 border-t border-border space-y-2">
              <Link href="/settings">
                <div 
                  className={cn(
                    "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all duration-200",
                    location === "/settings"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  )}
                  onClick={() => setMobileMenuOpen(false)}
                  data-testid="link-user-settings-mobile"
                >
                  <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center border border-border flex-shrink-0">
                    {user?.profileImageUrl ? (
                      <img src={user.profileImageUrl} alt="User" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{user?.firstName || 'User'}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                  <Settings className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>
              </Link>
              <Button 
                variant="outline" 
                className="w-full justify-start gap-2 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 min-h-[44px]"
                onClick={() => {
                  logout();
                  setMobileMenuOpen(false);
                }}
              >
                <LogOut className="w-4 h-4" />
                Log Out
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
