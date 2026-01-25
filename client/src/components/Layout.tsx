import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { 
  LayoutDashboard, 
  Map, 
  HardHat, 
  Truck, 
  LogOut, 
  Menu,
  X,
  User
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/projects", label: "Projects", icon: Map },
    { href: "/schedule", label: "Schedule", icon: HardHat },
    { href: "/equipment", label: "Equipment", icon: Truck },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-card border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center">
            <span className="text-primary-foreground font-bold font-display">CS</span>
          </div>
          <span className="font-display font-bold text-lg">ConstructOS</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X /> : <Menu />}
        </Button>
      </div>

      {/* Sidebar Navigation */}
      <aside className={cn(
        "fixed inset-0 z-50 bg-card border-r border-border w-64 transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0 flex flex-col",
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 hidden md:flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-orange-600 rounded-lg shadow-lg shadow-primary/20 flex items-center justify-center">
            <span className="text-primary-foreground font-bold font-display text-xl">CS</span>
          </div>
          <div className="flex flex-col">
            <span className="font-display font-bold text-xl tracking-tight">ConstructOS</span>
            <span className="text-xs text-muted-foreground uppercase tracking-widest">Enterprise</span>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer group",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}>
                  <item.icon className={cn("w-5 h-5", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border mt-auto">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center border border-border">
              {user?.profileImageUrl ? (
                <img src={user.profileImageUrl} alt="User" className="w-full h-full rounded-full object-cover" />
              ) : (
                <User className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.firstName || 'User'}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <Button 
            variant="outline" 
            className="w-full justify-start gap-2 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50"
            onClick={() => logout()}
          >
            <LogOut className="w-4 h-4" />
            Log Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto h-[calc(100vh-64px)] md:h-screen p-4 md:p-8 bg-background relative">
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none" 
             style={{ 
               backgroundImage: `linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)`,
               backgroundSize: '40px 40px' 
             }} 
        />
        <div className="relative z-10 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
      
      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}
