import { Link, useLocation, useParams, useSearch } from "wouter";
import { useEffect } from "react";
import { ArrowLeft, ChevronRight, FileText, ListChecks, Settings2, Shield, Zap } from "lucide-react";
import { DocumentCategoriesSettings } from "@/components/settings/DocumentCategoriesSettings";
import { ScopeCatalogSettings } from "@/components/settings/ScopeCatalogSettings";
import UserManagement from "@/pages/UserManagement";
import WorkflowRules from "@/pages/WorkflowRules";
import NotFound from "@/pages/not-found";
import EstimatingRates from "@/pages/EstimatingRates";
import { useAuth } from "@/hooks/use-auth";

// One directory definition drives the landing page, child pages, and legacy links.
export const adminSettingsOptions = [
  {
    slug: "estimating-rates",
    title: "Estimating Rates",
    description: "Company formula rates, labor, equipment and estimating markups.",
    icon: Settings2,
    component: EstimatingRates,
    hasPageHeading: true,
    legacyPath: null,
  },
  {
    slug: "document-categories",
    title: "Document Categories",
    description: "Organize bidding documents. Manage categories, display order, and change history.",
    icon: FileText,
    component: DocumentCategoriesSettings,
    hasPageHeading: false,
    legacyPath: null,
  },
  {
    slug: "users",
    title: "User Management",
    description: "Manage team access, approved emails, and user roles.",
    icon: Shield,
    component: UserManagement,
    hasPageHeading: true,
    legacyPath: "/admin/users",
  },
  {
    slug: "workflows",
    title: "Workflows",
    description: "Set up automatic assignments and notifications for project and bidding status changes.",
    icon: Zap,
    component: WorkflowRules,
    hasPageHeading: true,
    legacyPath: "/admin/workflows",
  },
  {
    slug: "scope-items",
    title: "Bidding Scope Items",
    description: "Manage the categories and checklist items used to review new opportunities.",
    icon: ListChecks,
    component: ScopeCatalogSettings,
    hasPageHeading: false,
    legacyPath: null,
  },
];

export const adminSettingsPath = (slug: string) => `/admin/settings/${slug}`;

export default function AdminSettings() {
  const { isAdmin, canEstimate } = useAuth();
  if (!isAdmin && !canEstimate) return <NotFound />;
  return (
    <div className="w-full max-w-3xl space-y-6 pt-14 md:pt-0">
      <header>
        <h1 className="flex items-center gap-3 text-2xl font-bold sm:text-3xl">
          <Settings2 className="h-7 w-7 shrink-0 text-primary" aria-hidden="true" />
          Admin Settings
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage shared settings for your team. Choose an option to get started.
        </p>
      </header>
      <nav aria-label="Available admin settings" className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <ul className="divide-y divide-border">
          {adminSettingsOptions.filter(option => isAdmin || option.slug === "estimating-rates").map(option => (
            <li key={option.slug}>
              <Link
                href={adminSettingsPath(option.slug)}
                aria-labelledby={`setting-title-${option.slug}`}
                aria-describedby={`setting-description-${option.slug}`}
                className="group flex min-h-24 items-center gap-3 p-4 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:gap-4 sm:p-5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-foreground">
                  <option.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span id={`setting-title-${option.slug}`} className="block font-semibold">{option.title}</span>
                  <span id={`setting-description-${option.slug}`} className="mt-1 block text-sm text-muted-foreground">{option.description}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function AdminSettingsDetail() {
  const { section } = useParams<{ section: string }>();
  const { isAdmin, canEstimate } = useAuth();
  const option = adminSettingsOptions.find(entry => entry.slug === section);
  if (!option || (!isAdmin && !(canEstimate && section === "estimating-rates"))) return <NotFound />;
  const Component = option.component;

  return (
    <div className="min-w-0 space-y-5 pt-14 md:pt-0">
      <nav aria-label="Admin settings navigation">
        <Link href="/admin/settings" className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Admin Settings
        </Link>
      </nav>
      {!option.hasPageHeading && (
        <h1 className="text-2xl font-bold">{option.title}</h1>
      )}
      <Component key={option.slug} />
    </div>
  );
}

export function LegacyAdminSettingsRedirect() {
  const [location, navigate] = useLocation();
  const search = useSearch();
  const option = adminSettingsOptions.find(entry => entry.legacyPath === location);
  useEffect(() => {
    if (option) navigate(`${adminSettingsPath(option.slug)}${search ? `?${search}` : ""}`, { replace: true });
  }, [option, search, navigate]);
  return null;
}