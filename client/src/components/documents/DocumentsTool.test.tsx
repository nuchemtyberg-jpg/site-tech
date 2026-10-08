import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentsTool } from "./DocumentsTool";
import { getProxyUrlWithFilename } from "@/lib/utils";

const mock = vi.hoisted(() => ({
  useTools: vi.fn(), createFile: vi.fn(), updateFile: vi.fn(), deleteFile: vi.fn(),
  createFolder: vi.fn(), updateFolder: vi.fn(), deleteFolder: vi.fn(), batch: vi.fn(),
  refetchFiles: vi.fn(), refetchFolders: vi.fn(),
}));
vi.mock("./use-document-tools", async original => ({
  ...await original<typeof import("./use-document-tools")>(),
  useDocumentTools: mock.useTools,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/NativeFileUploader", () => ({
  NativeFileUploader: ({ children, onUploadComplete, maxNumberOfFiles }: any) => <button data-testid="button-upload-files" onClick={() => onUploadComplete([{ name: "revision.pdf", objectPath: "/objects/new", size: 3401, type: "application/pdf" }])}>{children}<span className="sr-only">{maxNumberOfFiles === 1 ? "Pick revision" : "Pick documents"}</span></button>,
}));
const files = [
  { id: 11, name: "old-plan.pdf", documentGroupId: 11, documentVersion: 1, documentStatus: "superseded", folderId: null, albumId: null, tags: ["grading"], starred: true, contentType: "application/pdf", size: 4301, objectPath: "/objects/old", uploaderName: "Marta Ruiz", createdAt: "2026-03-18T12:30:00Z" },
  { id: 12, name: "site-plan.pdf", documentGroupId: 11, documentVersion: 2, documentStatus: "current", folderId: null, albumId: null, tags: ["grading"], starred: true, contentType: "application/pdf", size: 6347, objectPath: "/objects/current", uploaderName: "Luis Vega", createdAt: "2026-03-19T12:30:00Z" },
  { id: 13, name: "permit.pdf", documentGroupId: null, documentVersion: 1, documentStatus: "current", folderId: 2, albumId: null, tags: [], starred: false, contentType: "application/pdf", size: 3401, objectPath: "/objects/permit", uploaderName: "Luis Vega", createdAt: null },
] as any;
const folders = [{ id: 2, name: "Permits", parentId: null }, { id: 3, name: "Approved", parentId: 2 }] as any;
function tools(data = files) {
  return {
    files: { data, isLoading: false, isError: false, refetch: mock.refetchFiles },
    folders: { data: folders, isLoading: false, isError: false, refetch: mock.refetchFolders },
    createFile: { mutateAsync: mock.createFile }, updateFile: { mutateAsync: mock.updateFile },
    deleteFile: { mutateAsync: mock.deleteFile }, createFolder: { mutateAsync: mock.createFolder },
    updateFolder: { mutateAsync: mock.updateFolder }, deleteFolder: { mutateAsync: mock.deleteFolder },
    batch: { mutateAsync: mock.batch },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, "", "/");
  mock.useTools.mockReturnValue(tools());
  for (const mutation of [mock.createFile, mock.updateFile, mock.deleteFile, mock.updateFolder, mock.deleteFolder, mock.batch]) mutation.mockResolvedValue({});
  mock.createFolder.mockResolvedValue({ id: 7, name: "Plans", parentId: null });
});
afterEach(() => vi.restoreAllMocks());

describe.each(["project", "opportunity"] as const)("%s shared Documents", entityType => {
  const mount = () => render(<DocumentsTool entityType={entityType} entityId={1} />);
  async function menu(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Actions for site-plan.pdf" }));
  }
  it("shows only current entries with Project controls, without categories", () => {
    mount();
    expect(mock.useTools).toHaveBeenCalledWith(entityType, 1, undefined, false);
    expect(screen.getByText("site-plan.pdf")).toBeInTheDocument();
    expect(screen.queryByText("old-plan.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("Version 2")).toBeInTheDocument();
    for (const label of ["Grid view", "List view", "Show starred files", "Select items", "New Folder"]) expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
  it("opens downloadable history with uploader and date information", async () => {
    const user = userEvent.setup(); mount(); await menu(user);
    await user.click(screen.getByRole("menuitem", { name: "Version history" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("old-plan.pdf")).toBeInTheDocument();
    expect(within(dialog).getByText(/Marta Ruiz/)).toHaveTextContent("Mar 18, 2026");
    expect(within(dialog).getByRole("link", { name: "Download version 1" })).toHaveAttribute("href", getProxyUrlWithFilename("/objects/old", "old-plan.pdf", true));
    expect(within(dialog).getByRole("link", { name: "Download version 2" })).toHaveAttribute("href", getProxyUrlWithFilename("/objects/current", "site-plan.pdf", true));
  });
  it("uses an explicit revision target and leaves organization to the server", async () => {
    const user = userEvent.setup(); mount(); await menu(user);
    await user.click(screen.getByRole("menuitem", { name: "New version" }));
    await user.click(screen.getByRole("button", { name: /Pick revision/ }));
    await waitFor(() => expect(mock.createFile).toHaveBeenCalledWith({ name: "revision.pdf", objectPath: "/objects/new", size: 3401, contentType: "application/pdf", supersedesId: 12 }));
    expect(mock.createFile).toHaveBeenCalledTimes(1);
  });
  it("normal uploads never infer a version relationship", async () => {
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole("button", { name: /Pick documents/ }));
    await waitFor(() => expect(mock.createFile).toHaveBeenCalledWith(expect.objectContaining({ folderId: null })));
    expect(mock.createFile.mock.calls[0][0]).not.toHaveProperty("supersedesId");
  });
  it("cancels document deletion without a mutation", async () => {
    const user = userEvent.setup(); mount(); await menu(user);
    await user.click(screen.getByRole("menuitem", { name: "Delete document with history" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent('Delete "site-plan.pdf" and all of its versions');
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mock.deleteFile).not.toHaveBeenCalled();
  });
  it("distinguishes version deletion from deleting the complete document", async () => {
    const user = userEvent.setup(); mount(); await menu(user);
    await user.click(screen.getByRole("menuitem", { name: "Delete current version" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("newest remaining version becomes current");
    await user.click(screen.getByTestId("button-confirm-delete-document"));
    await waitFor(() => expect(mock.deleteFile).toHaveBeenCalledWith({ id: 12, scope: "version" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Delete site-plan.pdf" }));
    await user.click(screen.getByTestId("button-confirm-delete-document"));
    await waitFor(() => expect(mock.deleteFile).toHaveBeenLastCalledWith({ id: 12, scope: "document" }));
  });
  it("renames, edits tags and stars a logical document", async () => {
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole("button", { name: "Rename site-plan.pdf" }));
    await user.clear(screen.getByLabelText("File Name")); await user.type(screen.getByLabelText("File Name"), "Issued plan.pdf");
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(mock.updateFile).toHaveBeenCalledWith({ id: 12, name: "Issued plan.pdf" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Star site-plan.pdf" }));
    await waitFor(() => expect(mock.updateFile).toHaveBeenCalledWith({ id: 12, starred: false }));
    await user.click(screen.getByRole("button", { name: "Edit tags for site-plan.pdf" }));
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => expect(mock.updateFile).toHaveBeenCalledWith({ id: 12, tags: ["grading"] }));
  });
  it("supports nested folder URLs and current-only starred/search/grid results", async () => {
    const user = userEvent.setup(); mount();
    await user.click(screen.getByTestId("button-open-folder-2"));
    expect(window.location.search).toContain("folder=2");
    expect(screen.getByText("permit.pdf")).toBeInTheDocument();
    await user.click(screen.getByTestId("button-open-folder-3"));
    expect(screen.getByTestId("breadcrumb-2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show starred files" }));
    expect(screen.getByText("site-plan.pdf")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Search files and folders" }), "grading");
    await user.click(screen.getByRole("button", { name: "Grid view" }));
    expect(screen.getByTestId("file-item-12")).toBeInTheDocument();
    expect(screen.queryByTestId("file-item-11")).not.toBeInTheDocument();
  });
  it("bulk deletes selected current files and folders in one history-aware request", async () => {
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole("button", { name: "Select items" }));
    await user.click(screen.getByRole("button", { name: "Select all" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("complete histories");
    await user.click(screen.getByTestId("button-confirm-delete-document"));
    await waitFor(() => expect(mock.batch).toHaveBeenCalledWith({ fileIds: [12], folderIds: [2], action: "delete" }));
  });
  it("moves files and folders together and rejects descendant destinations", async () => {
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole("button", { name: "Select items" }));
    await user.click(screen.getByRole("button", { name: "Select all" }));
    await user.click(screen.getByRole("button", { name: "Move" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Permits" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Approved" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Move Here (Root)" }));
    await waitFor(() => expect(mock.batch).toHaveBeenCalledWith({ fileIds: [12], folderIds: [2], action: "move", folderId: null }));
  });
  it("keeps native PDF opening", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const user = userEvent.setup(); mount();
    await user.click(screen.getByText("site-plan.pdf"));
    expect(open).toHaveBeenCalledWith(getProxyUrlWithFilename("/objects/current", "site-plan.pdf"), "_blank", "noopener");
  });
});

it("shows a composed loading/error state with retries", async () => {
  mock.useTools.mockReturnValue({ ...tools(), files: { isLoading: true } });
  const page = render(<DocumentsTool entityType="project" entityId={1} />);
  expect(screen.getByLabelText("Loading documents")).toBeInTheDocument();
  mock.useTools.mockReturnValue({ ...tools(), files: { isError: true, refetch: mock.refetchFiles } });
  page.rerender(<DocumentsTool entityType="project" entityId={1} />);
  await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
  expect(mock.refetchFiles).toHaveBeenCalled();
  expect(mock.refetchFolders).toHaveBeenCalled();
});

it("clears selections and dialogs between entity owners with matching IDs", async () => {
  const user = userEvent.setup();
  const page = render(<DocumentsTool entityType="project" entityId={1} />);
  await user.click(screen.getByRole("button", { name: "Select items" }));
  await user.click(screen.getByRole("button", { name: "Select all" }));
  page.rerender(<DocumentsTool entityType="opportunity" entityId={1} />);
  expect(screen.getByRole("button", { name: "Select items" })).toBeInTheDocument();
  expect(screen.queryByText("2 selected")).not.toBeInTheDocument();
});
