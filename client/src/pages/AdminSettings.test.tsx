import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  user: {
    id: "admin-1",
    firstName: "Ada",
    lastName: "Admin",
    email: "ada@example.com",
    role: "admin",
    isAuthorized: "approved",
  } as any,
  isLoading: false,
  isApproved: true,
  isAdmin: true,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    ...authState,
    logout: vi.fn(),
  }),
}));

vi.mock("@/components/NotificationBell", () => ({
  NotificationBell: () => <span data-testid="notification-bell" />,
}));
vi.mock("@/components/ThemeToggle", () => ({
  ThemeToggle: () => <button type="button">Toggle theme</button>,
}));

vi.mock("@/components/settings/DocumentCategoriesSettings", () => ({
  DocumentCategoriesSettings: () => <div>Document Categories component</div>,
}));
vi.mock("@/components/settings/ScopeCatalogSettings", () => ({
  ScopeCatalogSettings: () => <div>Bidding Scope Items component</div>,
}));
vi.mock("@/pages/UserManagement", () => ({
  default: () => <div>User Management component</div>,
}));
vi.mock("@/pages/WorkflowRules", () => ({
  default: () => <div>Workflows component</div>,
}));

vi.mock("@/pages/AuthPage", () => ({ default: () => <div>Sign in page</div> }));
vi.mock("@/pages/PendingAccessPage", () => ({ default: () => <div>Pending access page</div> }));
vi.mock("@/pages/Dashboard", () => ({ default: () => <div>Dashboard page</div> }));
vi.mock("@/pages/Projects", () => ({ default: () => <div>Projects page</div> }));
vi.mock("@/pages/ProjectDetails", () => ({ default: () => <div>Project details page</div> }));
vi.mock("@/pages/Opportunities", () => ({ default: () => <div>Opportunities page</div> }));
vi.mock("@/pages/OpportunityDetails", () => ({ default: () => <div>Opportunity details page</div> }));
vi.mock("@/pages/Customers", () => ({ default: () => <div>Customers page</div> }));
vi.mock("@/pages/CustomerDetails", () => ({ default: () => <div>Customer details page</div> }));
vi.mock("@/pages/Schedule", () => ({ default: () => <div>Schedule page</div> }));
vi.mock("@/pages/Equipment", () => ({ default: () => <div>Equipment page</div> }));
vi.mock("@/pages/EquipmentDetails", () => ({ default: () => <div>Equipment details page</div> }));
vi.mock("@/pages/PDFViewerPage", () => ({ default: () => <div>PDF page</div> }));
vi.mock("@/pages/DailyReportPage", () => ({ default: () => <div>Daily report page</div> }));
vi.mock("@/pages/MyWork", () => ({ default: () => <div>My Work page</div> }));
vi.mock("@/pages/EmailSetup", () => ({ default: () => <div>Email setup page</div> }));
vi.mock("@/pages/Billing", () => ({ default: () => <div>Billing page</div> }));
vi.mock("@/pages/Employees", () => ({ default: () => <div>Employees page</div> }));
vi.mock("@/pages/CompanyDocuments", () => ({ default: () => <div>Company documents page</div> }));
vi.mock("@/pages/Reports", () => ({ default: () => <div>Reports page</div> }));

import { Router } from "@/App";
import { Layout } from "@/components/Layout";
import Settings from "@/pages/Settings";

function goTo(path: string) {
  window.history.replaceState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function renderRoute(path: string) {
  goTo(path);
  return render(<Router />);
}

function becomeAdmin() {
  authState.user = {
    id: "admin-1",
    firstName: "Ada",
    lastName: "Admin",
    email: "ada@example.com",
    role: "admin",
    isAuthorized: "approved",
  };
  authState.isLoading = false;
  authState.isApproved = true;
  authState.isAdmin = true;
}

beforeEach(() => {
  becomeAdmin();
  goTo("/");
});

describe("admin settings Router guards", () => {
  for (const path of ["/admin/settings", "/admin/settings/users"]) {
    it(`allows an approved admin to open ${path}`, () => {
      renderRoute(path);
      expect(screen.queryByText("404 Page Not Found")).not.toBeInTheDocument();
      expect(
        path.endsWith("/users")
          ? screen.getByText("User Management component")
          : screen.getByRole("heading", { name: "Admin Settings" }),
      ).toBeInTheDocument();
    });

    it(`returns 404 for a non-admin opening ${path}`, () => {
      authState.user = { ...authState.user, role: "member" };
      authState.isAdmin = false;
      renderRoute(path);
      expect(screen.getByText("404 Page Not Found")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Admin Settings" })).not.toBeInTheDocument();
    });

    it(`shows sign in for an anonymous visitor opening ${path}`, () => {
      authState.user = null;
      authState.isApproved = false;
      authState.isAdmin = false;
      renderRoute(path);
      expect(screen.getByText("Sign in page")).toBeInTheDocument();
      expect(screen.queryByText("404 Page Not Found")).not.toBeInTheDocument();
    });

    it(`shows pending access for an unapproved visitor opening ${path}`, () => {
      authState.user = { ...authState.user, isAuthorized: "pending" };
      authState.isApproved = false;
      renderRoute(path);
      expect(screen.getByText("Pending access page")).toBeInTheDocument();
      expect(screen.queryByText("404 Page Not Found")).not.toBeInTheDocument();
    });
  }
});

describe("admin settings directory and child routes", () => {
  it("lists all four settings and contains no forms on the landing page", () => {
    const { container } = renderRoute("/admin/settings");

    const expectedLinks = [
      ["Document Categories", "/admin/settings/document-categories"],
      ["User Management", "/admin/settings/users"],
      ["Workflows", "/admin/settings/workflows"],
      ["Bidding Scope Items", "/admin/settings/scope-items"],
    ];
    for (const [label, href] of expectedLinks) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toHaveAttribute("href", href);
    }
    expect(container.querySelector("form")).not.toBeInTheDocument();
    expect(screen.queryByText(/ component$/)).not.toBeInTheDocument();
  });

  it.each([
    ["/admin/settings/document-categories", "Document Categories component"],
    ["/admin/settings/users", "User Management component"],
    ["/admin/settings/workflows", "Workflows component"],
    ["/admin/settings/scope-items", "Bidding Scope Items component"],
  ])("renders the existing component at %s with a Back link", (path, componentText) => {
    renderRoute(path);
    expect(screen.getByText(componentText)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Admin Settings" })).toHaveAttribute(
      "href",
      "/admin/settings",
    );
  });

  it("renders 404 for an unknown admin settings section", () => {
    renderRoute("/admin/settings/not-a-real-section");
    expect(screen.getByText("404 Page Not Found")).toBeInTheDocument();
  });

  it.each([
    ["/admin/users?from=legacy", "/admin/settings/users?from=legacy", "User Management component"],
    ["/admin/workflows?from=legacy", "/admin/settings/workflows?from=legacy", "Workflows component"],
  ])("replaces legacy route %s with %s", async (legacyPath, replacement, componentText) => {
    renderRoute(legacyPath);
    await waitFor(() => expect(`${window.location.pathname}${window.location.search}`).toBe(replacement));
    expect(screen.getByText(componentText)).toBeInTheDocument();
  });
});

describe("settings navigation regression coverage", () => {
  it("keeps personal Settings free of shared admin catalogs", () => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          queryFn: async () => ({ connected: false, email: null, source: null, canConnect: false }),
        },
      },
    });
    render(
      <QueryClientProvider client={client}>
        <Settings />
      </QueryClientProvider>,
    );

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByText("Document Categories component")).not.toBeInTheDocument();
    expect(screen.queryByText("Bidding Scope Items component")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Document Categories" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Bidding Scope Items" })).not.toBeInTheDocument();
  });

  it("shows active Admin Settings links in desktop and mobile nav without old standalone links", () => {
    goTo("/admin/settings/workflows");
    render(
      <Layout>
        <div>Child page</div>
      </Layout>,
    );

    const desktopAdminLink = screen.getByTestId("link-admin-settings").closest("a");
    expect(desktopAdminLink).toHaveTextContent("Admin Settings");
    expect(desktopAdminLink).toHaveAttribute("href", "/admin/settings");
    expect(desktopAdminLink).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "User Management" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Workflows" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("button-mobile-menu"));
    const mobileMenu = screen.getByTestId("img-logo-mobile").closest("div.fixed") as HTMLElement;
    const mobileAdminLink = within(mobileMenu).getByRole("link", { name: "Admin Settings" });
    expect(mobileAdminLink).toHaveAttribute("href", "/admin/settings");
    expect(mobileAdminLink).toHaveAttribute("aria-current", "page");
    expect(within(mobileMenu).queryByRole("link", { name: "User Management" })).not.toBeInTheDocument();
    expect(within(mobileMenu).queryByRole("link", { name: "Workflows" })).not.toBeInTheDocument();
  });
});