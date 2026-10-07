import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRegistrationSession, readDroppedFiles, uploadDroppedFile } from "./document-uploads";
import type { UploadResult } from "@/components/NativeFileUploader";
const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/queryClient", () => ({ apiRequest: request }));
const result = (path: string, relativePath?: string): UploadResult => ({ name: "plan.pdf", size: 3701, type: "application/pdf", objectPath: path, cloudinaryPublicId: "", cloudinaryUrl: "", relativePath });
beforeEach(() => vi.clearAllMocks());

describe("registration sessions", () => {
  it("awaits registration and retries only failed records without duplicate successful registrations", async () => {
    const createFile = vi.fn().mockResolvedValueOnce({ id: 1 }).mockRejectedValueOnce(new Error("Registration failed")).mockResolvedValue({});
    const session = createRegistrationSession({ base: "/api/document-tools/project/1", folderId: 4, getFolders: () => [], createFolder: vi.fn(), createFile });
    await expect(session.register([result("/a"), result("/b")])).rejects.toThrow("Registration failed");
    await session.register([result("/a"), result("/b")]);
    expect(createFile.mock.calls.map(([data]) => data.objectPath)).toEqual(["/a", "/b", "/b"]);
  });
  it("preserves nested folder structure across callbacks/retries and never falls back to root", async () => {
    const createFolder = vi.fn().mockResolvedValueOnce({ id: 2 }).mockResolvedValueOnce({ id: 3 });
    const createFile = vi.fn().mockResolvedValue({});
    const session = createRegistrationSession({ base: "/api/document-tools/opportunity/1", folderId: 8, getFolders: () => [], createFolder, createFile });
    await session.register([result("/a", "Plans/Issued"), result("/b", "Plans/Issued")]);
    expect(createFolder.mock.calls).toEqual([[{ name: "Plans", parentId: 8 }], [{ name: "Issued", parentId: 2 }]]);
    expect(createFile.mock.calls.every(([data]) => data.folderId === 3)).toBe(true);
    createFolder.mockRejectedValue(new Error("Folder failed"));
    request.mockResolvedValue({ json: async () => [] });
    await expect(session.register([result("/c", "Failed")])).rejects.toThrow("Folder failed");
    expect(createFile).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledWith("GET", "/api/document-tools/opportunity/1/folders");
  });
  it("keeps same-name normal uploads independent and revisions explicitly targeted", async () => {
    const createFile = vi.fn().mockResolvedValue({});
    const normal = createRegistrationSession({ base: "/api/document-tools/project/1", folderId: null, getFolders: () => [], createFolder: vi.fn(), createFile });
    await normal.register([result("/a"), result("/b")]);
    expect(createFile).toHaveBeenCalledTimes(2);
    expect(createFile.mock.calls[0][0]).not.toHaveProperty("supersedesId");
    const revision = createRegistrationSession({ base: "/api/document-tools/project/1", folderId: 4, supersedesId: 7, getFolders: () => [], createFolder: vi.fn(), createFile });
    await revision.register([result("/revision")]);
    expect(createFile.mock.lastCall?.[0]).toEqual(expect.objectContaining({ supersedesId: 7 }));
    expect(createFile.mock.lastCall?.[0]).not.toHaveProperty("folderId");
  });
});
it("reuses stored objects when drop registration fails", async () => {
  request.mockResolvedValue({ json: async () => ({ uploadURL: "https://storage.example/upload", objectPath: "/objects/a" }) });
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
  const item = { file: new File(["plan"], "plan.pdf", { type: "application/pdf" }), relativePath: "Plans" };
  const first = await uploadDroppedFile(item); const retry = await uploadDroppedFile(item);
  expect(retry).toBe(first); expect(request).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockRestore();
});
it("falls back to files when transfer items expose no directory entries", async () => {
  const file = new File(["permit"], "permit.pdf");
  const dropped = await readDroppedFiles({ files: [file], items: [{ webkitGetAsEntry: () => null }] } as unknown as DataTransfer);
  expect(dropped.files).toEqual([{ file, relativePath: "" }]);
});
