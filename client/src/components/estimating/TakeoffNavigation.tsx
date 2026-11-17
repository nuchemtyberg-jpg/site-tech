import { Link, useLocation } from "wouter";
import { BookOpen, Settings2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import EstimatingAISettings from "./EstimatingAISettings";

// Mount after the primary nav list in both Layout navigation variants.
export function TakeoffNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const { canEstimate } = useAuth();
  const [location] = useLocation();
  if (!canEstimate) return null;
  const active = location.startsWith("/estimating/playbook");
  return <section className="pt-3 mt-3 border-t"><h2 className="px-4 pb-2 text-xs uppercase tracking-wide text-muted-foreground">Estimating</h2><Link href="/estimating/playbook" onClick={onNavigate} aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><BookOpen className="w-5 h-5 shrink-0" />Takeoff Playbook</Link></section>;
}

// Add to AdminSettings.adminSettingsOptions. Its existing admin-only filter
// already restricts every option except estimating-rates.
export const estimatingAISettingsOption = {
  slug: "estimating-ai",
  title: "Estimating AI",
  description: "Claude models, spending limits, token pricing and takeoff run history.",
  icon: Settings2,
  component: EstimatingAISettings,
  hasPageHeading: true,
  legacyPath: null,
};
