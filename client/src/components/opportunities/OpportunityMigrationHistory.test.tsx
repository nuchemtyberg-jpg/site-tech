import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpportunityMigrationHistory } from "./OpportunityMigrationHistory";
const migrationQuery = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-project-bids", () => ({ useOpportunityMigrationHistory: migrationQuery }));

describe("OpportunityMigrationHistory", () => {
  beforeEach(() => migrationQuery.mockReturnValue({
    isLoading: false, isError: false, refetch: vi.fn(),
    data: {
      project: { id: 54, name: "Harbor Drainage", projectNumber: "P-204", streetAddress: "18 Pier Road", address2: "Suite 3", city: "New Bedford", state: "MA", description: "Catch basin replacement", estimatedValue: 48250 },
      contacts: [{ link: { roleLabel: "Site superintendent", isPrimary: true }, contact: { firstName: "Nora", lastName: "Chen", email: "nora@example.test" } }],
      todos: [{ id: 1, title: "Confirm locates", status: "completed", dueDate: "2024-02-10" }],
      statusHistory: [{ id: 2, previousStatus: "new", newStatus: "in_progress", changedAt: "2024-02-01" }],
      activity: [{ id: 3, description: "Original project migrated", actorName: "Sam R.", createdAt: "2024-02-02" }],
      tasks: [{ id: 4, title: "Trench excavation", status: "completed", description: "North access" }],
      communications: [{ id: 5, subject: "Site walk", type: "meeting", notes: "Reviewed staging plan" }],
      files: [
        { id: 6, name: "issued-layout.pdf", objectPath: "/objects/issued-layout.pdf", contentType: "application/pdf" },
        { id: 8, name: "archived-layout.pdf", objectPath: "/objects/archived-layout.pdf", contentType: "application/pdf", deletedAt: "2024-02-04T11:00:00Z" },
      ],
      folders: [{ id: 7, name: "Permits" }],
      retainedWork: {
        photos: [{ id: 51, name: "South apron pour", url: "/objects/apron-photo.jpg", contentType: "image/jpeg", caption: "Concrete placement complete", takenAt: "2024-02-03T14:20:00Z" }],
        dailyReports: [{ id: 52, reportNumber: "DR-018", reportDate: "2024-02-04", weather: "Cloudy", foremanName: "Nora Chen", notes: "Crew completed north access." }],
        reportLabor: [{ id: 53, employeeName: "Luis Ortega", laborHours: 7.5, laborType: "Operator" }],
        emails: [{ id: 54, subject: "Walk-through confirmed", from: "owner@example.test", sentAt: "2024-02-04T15:00:00Z", bodyHtml: "<p>Walk-through is confirmed.</p><script>window.__mailExecuted = true</script>" }],
        emailAttachments: [{ id: 55, fileName: "walk-through.pdf", objectPath: "/objects/walk-through.pdf", contentType: "application/pdf" }],
        notifications: [{ id: 56, title: "Report delivered", createdAt: "2024-02-04T16:00:00Z", message: "Daily report sent to customer" }],
      },
    },
  }));
  it("renders source terms and retained records as readable history", () => {
    render(<OpportunityMigrationHistory opportunityId={88} />);
    expect(screen.getByText("Harbor Drainage")).toBeInTheDocument();
    expect(screen.getAllByText(/18 Pier Road, Suite 3, New Bedford, MA/)).toHaveLength(2);
    expect(screen.getByText(/Site superintendent/)).toBeInTheDocument();
    expect(screen.getByText("Confirm locates")).toBeInTheDocument();
    expect(screen.getByText("Original project migrated")).toBeInTheDocument();
    expect(screen.getByText("Trench excavation")).toBeInTheDocument();
    expect(screen.getByText("Reviewed staging plan")).toBeInTheDocument();
    expect(screen.getByText("issued-layout.pdf")).toBeInTheDocument();
    expect(screen.getByText("Permits")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open / download issued-layout.pdf" })).toHaveAttribute("href", "/objects/issued-layout.pdf?filename=issued-layout.pdf&download=true");
    expect(screen.getByText("archived-layout.pdf")).toBeInTheDocument();
    expect(screen.getByText("Deleted · read only")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open / download archived-layout.pdf" })).not.toBeInTheDocument();
  });

  it("expands retained source work with semantic fields, safe email text, and image links", () => {
    render(<OpportunityMigrationHistory opportunityId={88} />);
    fireEvent.click(screen.getByText("Project photos"));
    fireEvent.click(screen.getAllByText("South apron pour")[0]);
    expect(screen.getByText("Concrete placement complete")).toBeInTheDocument();
    expect(screen.getByAltText("South apron pour")).toHaveAttribute("src", "/objects/apron-photo.jpg");
    expect(screen.getByRole("link", { name: "Open image South apron pour" })).toHaveAttribute("href", "/objects/apron-photo.jpg");

    fireEvent.click(screen.getByText("Daily reports"));
    fireEvent.click(screen.getAllByText("DR-018")[0]);
    expect(screen.getByText("Report date")).toBeInTheDocument();
    expect(screen.getByText("Foreman").parentElement).toHaveTextContent("Nora Chen");

    fireEvent.click(screen.getByText("Project emails"));
    fireEvent.click(screen.getAllByText("Walk-through confirmed")[0]);
    expect(screen.getByText("Walk-through is confirmed.")).toBeInTheDocument();
    expect(screen.queryByText(/window\.__mailExecuted/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Email attachments"));
    fireEvent.click(screen.getAllByText("walk-through.pdf")[0]);
    expect(screen.getByRole("link", { name: /Open \/ download walk-through.pdf/ })).toHaveAttribute("href", "/objects/walk-through.pdf?filename=walk-through.pdf&download=true");
  });
});
