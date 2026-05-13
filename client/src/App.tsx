import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

// Pages
import Dashboard from "@/pages/Dashboard";
import Projects from "@/pages/Projects";
import ProjectDetails from "@/pages/ProjectDetails";
import Customers from "@/pages/Customers";
import CustomerDetails from "@/pages/CustomerDetails";
import Schedule from "@/pages/Schedule";
import Equipment from "@/pages/Equipment";
import EquipmentDetails from "@/pages/EquipmentDetails";
import AuthPage from "@/pages/AuthPage";
import PendingAccessPage from "@/pages/PendingAccessPage";
import PDFViewerPage from "@/pages/PDFViewerPage";
import DailyReportPage from "@/pages/DailyReportPage";
import UserManagement from "@/pages/UserManagement";
import EmailSetup from "@/pages/EmailSetup";
import Billing from "@/pages/Billing";
import Employees from "@/pages/Employees";
import Settings from "@/pages/Settings";
import CompanyDocuments from "@/pages/CompanyDocuments";
import Reports from "@/pages/Reports";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component, adminOnly = false }: { component: React.ComponentType; adminOnly?: boolean }) {
  const { user, isLoading, isApproved, isAdmin } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  if (!isApproved) {
    return <PendingAccessPage />;
  }

  if (adminOnly && !isAdmin) {
    return <NotFound />;
  }

  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function ProtectedFullScreenRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading, isApproved } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  if (!isApproved) {
    return <PendingAccessPage />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={() => <ProtectedRoute component={Projects} />} />
      <Route path="/projects" component={() => <ProtectedRoute component={Projects} />} />
      <Route path="/projects/:id" component={() => <ProtectedRoute component={ProjectDetails} />} />
      <Route path="/projects/:projectId/pdf/:fileId" component={() => <ProtectedFullScreenRoute component={PDFViewerPage} />} />
      <Route path="/projects/:projectId/reports/new" component={() => <ProtectedFullScreenRoute component={DailyReportPage} />} />
      <Route path="/projects/:projectId/reports/:reportId" component={() => <ProtectedFullScreenRoute component={DailyReportPage} />} />
      <Route path="/customers" component={() => <ProtectedRoute component={Customers} />} />
      <Route path="/customers/:id" component={() => <ProtectedRoute component={CustomerDetails} />} />
      <Route path="/schedule" component={() => <ProtectedRoute component={Schedule} />} />
      <Route path="/equipment" component={() => <ProtectedRoute component={Equipment} />} />
      <Route path="/equipment/:id" component={() => <ProtectedRoute component={EquipmentDetails} />} />
      <Route path="/employees" component={() => <ProtectedRoute component={Employees} />} />
      <Route path="/settings" component={() => <ProtectedRoute component={Settings} />} />
      <Route path="/admin/users" component={() => <ProtectedRoute component={UserManagement} adminOnly />} />
      <Route path="/admin/email-setup" component={() => <ProtectedRoute component={EmailSetup} adminOnly />} />
      <Route path="/admin/billing" component={() => <ProtectedRoute component={Billing} adminOnly />} />
      <Route path="/admin/documents" component={() => <ProtectedRoute component={CompanyDocuments} adminOnly />} />
      <Route path="/admin/reports" component={() => <ProtectedRoute component={Reports} adminOnly />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
