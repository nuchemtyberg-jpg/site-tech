import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import CompanyDocuments from "./CompanyDocuments";

vi.mock("@/components/PDFViewer", () => ({ PDFViewer: () => null }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
afterEach(() => vi.restoreAllMocks());

it("uploads multiple Company Documents files into one relative-path folder tree", async () => {
  const createdFolders: any[] = [];
  const createdFiles: any[] = [];
  let upload = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://storage.example/")) return new Response(null, { status: 200 });
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url === "/api/uploads/request-url") return new Response(JSON.stringify({ uploadURL: `https://storage.example/${++upload}`, objectPath: `/objects/${upload}` }));
    if (url === "/api/company-documents/folders" && init?.method === "POST") {
      const folder = { ...body, id: createdFolders.length + 1 };
      createdFolders.push(folder);
      return new Response(JSON.stringify(folder));
    }
    if (url === "/api/company-documents/files" && init?.method === "POST") {
      createdFiles.push(body);
      return new Response(JSON.stringify({ ...body, id: createdFiles.length }));
    }
    return new Response(JSON.stringify([]));
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, queryFn: async () => [] } } });
  const user = userEvent.setup();
  render(<QueryClientProvider client={client}><CompanyDocuments /></QueryClientProvider>);
  await user.click(screen.getByTestId("button-upload-files"));
  const selected = ["a.txt", "b.txt"].map(name => {
    const file = new File(["{}"], name, { type: "text/plain" });
    Object.defineProperty(file, "webkitRelativePath", { value: `Plans/Nested/${name}` });
    return file;
  });
  fireEvent.change(screen.getByTestId("input-folder-native"), { target: { files: selected } });
  await waitFor(() => expect(screen.getByTestId("button-start-upload")).toHaveTextContent("Upload 2 Files"));
  await user.click(screen.getByTestId("button-start-upload"));
  await waitFor(() => expect(createdFiles).toHaveLength(2));
  expect(createdFolders.map(folder => folder.name)).toEqual(["Plans", "Nested"]);
  expect(createdFolders[1].parentId).toBe(createdFolders[0].id);
  expect(createdFiles.map(file => file.folderId)).toEqual([createdFolders[1].id, createdFolders[1].id]);
  client.clear();
});
