import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DocumentsTab, DocumentUploadDialog } from "./OpportunityDetails";

const categories = [
  { id: 1, key: "plans", name: "Construction Drawings", isActive: true, displayOrder: 0, documentUsageCount: 1 },
  { id: 2, key: "permits", name: "Old Permits", isActive: false, displayOrder: 1, documentUsageCount: 1 },
  { id: 3, key: "contracts", name: "Contracts", isActive: true, displayOrder: 2, documentUsageCount: 0 },
];

vi.mock("@/hooks/use-document-categories", () => ({
  useDocumentCategories: () => ({ data: categories }),
}));

vi.mock("@/hooks/use-opportunities", async importOriginal => {
  const actual = await importOriginal<typeof import("@/hooks/use-opportunities")>();
  return {
    ...actual,
    useDeleteOpportunityDocument: () => ({ mutate: vi.fn() }),
    useCreateOpportunityDocument: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/NativeFileUploader", () => ({
  NativeFileUploader: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

const documents = [
  { id: 11, name: "site-plan.pdf", category: "plans", documentGroupId: 11, documentVersion: 1, objectPath: "/plans", uploaderName: "Admin" },
  { id: 12, name: "permit.pdf", category: "permits", documentGroupId: 12, documentVersion: 1, objectPath: "/permits", uploaderName: "Admin" },
] as any;

describe("opportunity document categories", () => {
  it("keeps documents grouped under renamed and inactive categories", () => {
    render(<DocumentsTab documents={documents} onUpload={vi.fn()} onNewVersion={vi.fn()} opportunityId={1} />);

    expect(screen.getByText("Construction Drawings (1)")).toBeInTheDocument();
    expect(screen.getByText("Old Permits (1)")).toBeInTheDocument();
    expect(screen.getByText("site-plan.pdf")).toBeInTheDocument();
    expect(screen.getByText("permit.pdf")).toBeInTheDocument();
  });

  it("keeps an inactive category available as a filter when it has documents", async () => {
    const user = userEvent.setup();
    render(<DocumentsTab documents={documents} onUpload={vi.fn()} onNewVersion={vi.fn()} opportunityId={1} />);

    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: "Old Permits (inactive)" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Old Permits (inactive)" }));

    expect(screen.getByText("permit.pdf")).toBeInTheDocument();
    expect(screen.queryByText("site-plan.pdf")).not.toBeInTheDocument();
  });

  it("excludes inactive categories from upload options", async () => {
    const user = userEvent.setup();
    render(<DocumentUploadDialog open onOpenChange={vi.fn()} opportunityId={1} versionTarget={null} />);

    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: "Construction Drawings" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Contracts" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Old Permits" })).not.toBeInTheDocument();
  });
});