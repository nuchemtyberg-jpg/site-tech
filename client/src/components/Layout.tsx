import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  LayoutDashboard, 
  FolderKanban, 
  Calendar, 
  Truck, 
  Users,
  LogOut, 
  Menu,
  X,
  User,
  Shield,
  MoreHorizontal
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout, isAdmin } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/projects", label: "Projects", icon: FolderKanban },
    { href: "/customers", label: "Customers", icon: Users },
    { href: "/schedule", label: "Schedule", icon: Calendar },
    { href: "/equipment", label: "Equipment", icon: Truck },
  ];
  
  const adminItems = [
    { href: "/admin/users", label: "User Management", icon: Shield },
  ];

  const mobileNavItems = navItems.slice(0, 4);
  const moreMenuItems = [
    ...navItems.slice(4),
    ...(isAdmin ? adminItems : []),
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Mobile Top Header */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-card border-b border-border safe-area-inset-top">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center">
            <span className="text-primary-foreground font-bold font-display text-sm">ST</span>
          </div>
          <span className="font-display font-bold text-lg">SiteTech</span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="min-h-[44px] min-w-[44px]"
            data-testid="button-mobile-menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 md:flex-row">
        {/* Desktop Sidebar Navigation */}
        <aside className={cn(
          "hidden md:flex fixed inset-y-0 left-0 z-50 bg-card border-r border-border w-64 flex-col"
        )}>
          <div className="p-6 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-orange-600 rounded-lg shadow-lg shadow-primary/20 flex items-center justify-center">
              <span className="text-primary-foreground font-bold font-display text-xl">ST</span>
            </div>
            <div className="flex flex-col">
              <span className="font-display font-bold text-xl tracking-tight">SiteTech</span>
              <span className="text-xs text-muted-foreground uppercase tracking-widest">Sitework Management</span>
            </div>
          </div>

          <nav className="flex-1 px-4 py-4 space-y-1">
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
            
            {isAdmin && (
              <>
                <div className="my-4 px-4">
                  <div className="h-px bg-border" />
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mt-4 mb-2">Admin</p>
                </div>
                {adminItems.map((item) => {
                  const isActive = location.startsWith(item.href);
                  return (
                    <Link key={item.href} href={item.href}>
                      <div 
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer group min-h-[44px]",
                          isActive 
                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25" 
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                        data-testid="link-user-management"
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

          <div className="p-4 border-t border-border mt-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3 px-2 min-w-0 flex-1">
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
              <ThemeToggle />
            </div>
            <Button 
              variant="outline" 
              className="w-full justify-start gap-2 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 min-h-[44px]"
              onClick={() => logout()}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
              Log Out
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 md:ml-64 min-h-screen bg-background relative">
          <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" 
               style={{ 
                 backgroundImage: `linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)`,
                 backgroundSize: '40px 40px' 
               }} 
          />
          <div className="relative z-10 w-full max-w-7xl mx-auto p-4 md:p-8 pb-24 md:pb-8">
            {children}
          </div>
        </main>
      </div>
      
      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-inset-bottom">
        <div className="flex items-stretch h-16">
          {mobileNavItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className="flex-1">
                <div 
                  className={cn(
                    "flex flex-col items-center justify-center h-full gap-1 transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                  data-testid={`tab-${item.label.toLowerCase()}`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium uppercase tracking-wide">{item.label}</span>
                </div>
              </Link>
            );
          })}
          
          {/* More Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className="flex-1 flex flex-col items-center justify-center h-full gap-1 text-muted-foreground"
                data-testid="tab-more"
              >
                <MoreHorizontal className="w-5 h-5" />
                <span className="text-[10px] font-medium uppercase tracking-wide">More</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 mb-2">
              {moreMenuItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  <DropdownMenuItem className="min-h-[44px] cursor-pointer">
                    <item.icon className="w-4 h-4 mr-2" />
                    {item.label}
                  </DropdownMenuItem>
                </Link>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="min-h-[44px]">
                <div className="flex items-center gap-3 w-full">
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
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="min-h-[44px] text-destructive cursor-pointer"
                onClick={() => logout()}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Log Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>

      {/* Mobile Slide-out Menu (for extra options) */}
      {mobileMenuOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 w-72 bg-card border-l border-border z-50 md:hidden flex flex-col safe-area-inset-top">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <span className="font-display font-bold">Menu</span>
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
              
              {isAdmin && (
                <>
                  <div className="my-4">
                    <div className="h-px bg-border" />
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mt-4 mb-2 px-4">Admin</p>
                  </div>
                  {adminItems.map((item) => {
                    const isActive = location.startsWith(item.href);
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
                </>
              )}
            </nav>

            <div className="p-4 border-t border-border">
              <div className="flex items-center gap-3 mb-4 p-2 bg-muted rounded-lg">
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
              </div>
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
