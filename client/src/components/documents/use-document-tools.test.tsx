import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@shared/routes";
import { documentToolsKey, groupDocuments, useDocumentTools } from "./use-document-tools";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/queryClient", () => ({ apiRequest: request }));
beforeEach(() => vi.clearAllMocks());

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
describe("entity-scoped document API", () => {
  it("isolates owners with matching numeric IDs and refreshes only the changed owner's activity", async () => {
    request.mockImplementation(async (_method, url) => ({ json: async () => url.endsWith("/files") ? [{ id: url.includes("/project/") ? 11 : 22, name: url }] : [] }));
    const { client, wrapper } = setup();
    const projectActivity = [api.activity.listForProject.path, 1];
    const opportunityActivity = [api.opportunities.activity.path, 1];
    client.setQueryData(projectActivity, []); client.setQueryData(opportunityActivity, []);
    const project = renderHook(() => useDocumentTools("project", 1), { wrapper });
    const opportunity = renderHook(() => useDocumentTools("opportunity", 1), { wrapper });
    await waitFor(() => expect(project.result.current.files.data?.[0]?.id).toBe(11));
    await waitFor(() => expect(opportunity.result.current.files.data?.[0]?.id).toBe(22));
    expect(documentToolsKey("project", 1)).not.toEqual(documentToolsKey("opportunity", 1));
    await act(async () => { await project.result.current.updateFile.mutateAsync({ id: 11, name: "Issued plans" }); });
    expect(request).toHaveBeenCalledWith("PUT", "/api/document-tools/project/1/files/11", { name: "Issued plans" });
    expect(client.getQueryState(projectActivity)?.isInvalidated).toBe(true);
    expect(client.getQueryState(opportunityActivity)?.isInvalidated).toBe(false);
    expect(opportunity.result.current.files.data?.[0]?.id).toBe(22);
  });
  it("sends explicit deletion scope, consumes 204 without JSON, and uses the batch contract", async () => {
    request.mockImplementation(async (method, url) => method === "DELETE" ? { json: () => { throw new Error("204 has no JSON"); } } : { json: async () => url.endsWith("/batch") ? { deleted: 2 } : [] });
    const { wrapper } = setup();
    const tools = renderHook(() => useDocumentTools("opportunity", 1), { wrapper });
    await act(async () => {
      await tools.result.current.deleteFile.mutateAsync({ id: 7, scope: "version" });
      await tools.result.current.deleteFile.mutateAsync({ id: 8, scope: "document" });
      await tools.result.current.deleteFolder.mutateAsync(3);
      await tools.result.current.batch.mutateAsync({ fileIds: [7], folderIds: [3], action: "move", folderId: null });
    });
    expect(request).toHaveBeenCalledWith("DELETE", "/api/document-tools/opportunity/1/files/7?scope=version");
    expect(request).toHaveBeenCalledWith("DELETE", "/api/document-tools/opportunity/1/files/8?scope=document");
    expect(request).toHaveBeenCalledWith("DELETE", "/api/document-tools/opportunity/1/folders/3");
    expect(request).toHaveBeenCalledWith("POST", "/api/document-tools/opportunity/1/batch", { fileIds: [7], folderIds: [3], action: "move", folderId: null });
  });
});
it("groups legacy documents without mutating input and promotes the latest remaining version in listings", () => {
  const files = [
    { id: 2, documentGroupId: 1, documentVersion: 2, documentStatus: "superseded" },
    { id: 1, documentGroupId: 1, documentVersion: 1, documentStatus: "superseded" },
    { id: 4, documentGroupId: null, documentVersion: 1, documentStatus: "current" },
  ] as any;
  const groups = groupDocuments(files);
  expect(groups.map(group => group.current.id)).toEqual([2, 4]);
  expect(groups[0].versions.map(version => version.id)).toEqual([2, 1]);
  expect(files.map((file: any) => file.id)).toEqual([2, 1, 4]);
});
