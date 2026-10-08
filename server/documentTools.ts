import type { Express } from "express";
import { and, eq, isNull, sql, getTableColumns } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { files, folders, projects, opportunities, projectContracts, users, activityLogs } from "@shared/schema";
import { isAuthenticated } from "./replit_integrations/auth";
import { isAuthorizedUser } from "./middleware/auth";

const id = z.coerce.number().int().positive();
const nullableId = z.number().int().positive().nullable();
const name = z.string().trim().min(1).max(500);
const fileCreate = z.object({
  name, objectPath: z.string().trim().min(1), contentType: z.string().optional(),
  size: z.number().int().nonnegative().optional(), folderId: nullableId.optional(),
  supersedesId: nullableId.optional(),
});
const fileUpdate = z.object({ name: name.optional(), folderId: nullableId.optional(), tags: z.array(z.string()).nullable().optional(), starred: z.boolean().optional() }).strict();
const folderInput = z.object({ name, parentId: nullableId.optional() }).strict();
class DocumentError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Every mutation locks the owning entity before reading its tree or versions.
// This serializes revisions, organization and recursive deletes together, not
// only uploads, and separates Project 12 from Opportunity 12.
export function registerDocumentTools(app: Express) {
  const base = "/api/document-tools/:entityType/:entityId";
  const handle = (operation: (ctx: any, req: any) => Promise<any>, status = 200) =>
    async (req: any, res: any) => {
      try {
         let type = z.enum(["project", "opportunity"]).parse(req.params.entityType);
         let entityId = id.parse(req.params.entityId);
        const result = await db.transaction(async tx => {
           // Resolve alias BEFORE the owner lock. Awards lock bid then Project,
           // so taking a Project lock first here would introduce a deadlock.
           const contextProjectId = type === "project" ? entityId : req.query.projectId ? id.parse(req.query.projectId) : null;
           if (contextProjectId) {
             const [project] = await tx.select().from(projects).where(and(eq(projects.id, contextProjectId), isNull(projects.deletedAt)));
             if (!project) throw new DocumentError(404, "Project not found");
             if (type === "project" && req.query.native !== "true") {
               const [original] = await tx.select().from(projectContracts)
                 .where(and(eq(projectContracts.projectId, contextProjectId), sql`${projectContracts.snapshot}->>'targetProjectId' is null`))
                 .orderBy(projectContracts.id).limit(1);
               if (original) { type = "opportunity"; entityId = original.opportunityId; }
             }
           }
          const table = type === "project" ? projects : opportunities;
          const [owner] = await tx.select().from(table).where(and(eq(table.id, entityId), isNull(table.deletedAt))).for("update");
          if (!owner) throw new DocumentError(404, "Owner not found");
           if (contextProjectId && type === "opportunity") {
             const bid = owner as typeof opportunities.$inferSelect;
             if (bid.convertedProjectId !== contextProjectId && bid.targetProjectId !== contextProjectId) {
               throw new DocumentError(403, "This bid is not linked to the requested Project");
             }
           }
          const fileScope = type === "project"
            ? and(eq(files.projectId, entityId), sql`(${files.relatedEntityType} is null or ${files.relatedEntityType} = 'project')`)
            : and(isNull(files.projectId), eq(files.relatedEntityType, "opportunity"), eq(files.relatedEntityId, entityId));
          const folderScope = type === "project"
            ? and(eq(folders.projectId, entityId), isNull(folders.opportunityId))
            : and(isNull(folders.projectId), eq(folders.opportunityId, entityId));
          const allFiles = await tx.select().from(files).where(fileScope);
          const allFolders = await tx.select().from(folders).where(and(folderScope, isNull(folders.deletedAt)));
          const getFile = (fileId: number) => {
            const file = allFiles.find(f => f.id === fileId && !f.deletedAt);
            if (!file) throw new DocumentError(404, "Document not found in this entity");
            return file;
          };
          const getFolder = (folderId: number | null | undefined) => {
            if (folderId == null) return null;
            const folder = allFolders.find(f => f.id === folderId);
            if (!folder) throw new DocumentError(404, "Folder not found in this entity");
            return folder;
          };
          const group = (file: typeof files.$inferSelect) => allFiles.filter(f => (f.documentGroupId ?? f.id) === (file.documentGroupId ?? file.id));
          const descendants = (folderId: number) => {
            getFolder(folderId);
            const found = new Set<number>([folderId]);
            let changed = true;
            while (changed) {
              changed = false;
              for (const f of allFolders) if (f.parentId != null && found.has(f.parentId) && !found.has(f.id)) { found.add(f.id); changed = true; }
            }
            return found;
          };
          const result = await operation({ tx, type, entityId, fileScope, allFiles, allFolders, getFile, getFolder, group, descendants }, req);
          if (req.method !== "GET") {
            const userId = req.user?.claims?.sub ?? req.user?.id;
            const [actor] = userId ? await tx.select().from(users).where(eq(users.id, userId)) : [];
            const actorName = [actor?.firstName, actor?.lastName].filter(Boolean).join(" ") || actor?.email || "Staff";
            const target = allFiles.find(f => f.id === Number(req.params.fileId));
            const label = result?.name ?? target?.name ?? req.body?.name ?? "documents";
            const action = req.method === "POST" && req.path.endsWith("/files")
              ? req.body.supersedesId ? "document_version_added" : "document_uploaded"
              : req.method === "DELETE" ? "document_deleted" : "documents_organized";
            await tx.insert(activityLogs).values({
               projectId: contextProjectId ?? (type === "project" ? entityId : (owner as any).convertedProjectId ?? null),
              entityType: `${type}_document`, entityId: result?.id ?? target?.id ?? entityId,
              action, actorUserId: userId ?? null, actorName,
              description: `${actorName} ${action === "document_uploaded" ? "uploaded" : action === "document_version_added" ? "uploaded a new version of" : action === "document_deleted" ? "deleted" : "organized"} "${label}".`,
              metadata: { customerId: owner.customerId, ...(type === "opportunity" ? { opportunityId: entityId } : { projectId: entityId }), scope: req.query.scope, fileIds: req.body?.fileIds, folderIds: req.body?.folderIds },
            });
          }
          return result;
        });
        if (status === 204) res.status(204).end(); else res.status(status).json(result);
      } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0].message });
        if (error instanceof DocumentError) return res.status(error.status).json({ message: error.message });
        console.error("Document operation failed", error);
        res.status(500).json({ message: "Document operation failed" });
      }
    };
  const auth = [isAuthenticated, isAuthorizedUser];
  app.get(`${base}/files`, ...auth, handle(async ({ tx, fileScope }) => {
    return tx.select({ ...getTableColumns(files), uploaderName: sql`nullif(trim(concat(${users.firstName}, ' ', ${users.lastName})), '')` })
      .from(files).leftJoin(users, eq(users.id, files.uploadedByUserId)).where(and(fileScope, isNull(files.deletedAt)));
  }));
  app.get(`${base}/folders`, ...auth, handle(async c => c.allFolders));
  app.post(`${base}/folders`, ...auth, handle(async (c, req) => {
    const input = folderInput.parse(req.body); c.getFolder(input.parentId);
    const [folder] = await c.tx.insert(folders).values({ ...input, projectId: c.type === "project" ? c.entityId : null, opportunityId: c.type === "opportunity" ? c.entityId : null }).returning();
    return folder;
  }, 201));
  app.put(`${base}/folders/:folderId`, ...auth, handle(async (c, req) => {
    const folderId = id.parse(req.params.folderId); c.getFolder(folderId);
    const input = folderInput.partial().parse(req.body); c.getFolder(input.parentId);
    if (input.parentId != null && c.descendants(folderId).has(input.parentId)) throw new DocumentError(400, "A folder cannot be moved inside itself");
    const [folder] = await c.tx.update(folders).set(input).where(eq(folders.id, folderId)).returning(); return folder;
  }));
  app.post(`${base}/files`, ...auth, handle(async (c, req) => {
    const { supersedesId, ...input } = fileCreate.parse(req.body);
    c.getFolder(input.folderId);
    let values: any = { ...input, projectId: c.type === "project" ? c.entityId : null, relatedEntityType: c.type, relatedEntityId: c.entityId, uploadedByUserId: req.user?.claims?.sub ?? req.user?.id };
    if (supersedesId) {
      const target = c.getFile(supersedesId);
      if (target.documentStatus !== "current") throw new DocumentError(409, "This is not the current version; refresh and try again");
      const versions = c.group(target);
      const groupId = target.documentGroupId ?? target.id;
      values = { ...values, documentGroupId: groupId, documentVersion: Math.max(...versions.map((v: any) => v.documentVersion)) + 1,
        name: target.name, folderId: target.folderId, tags: target.tags, starred: target.starred, category: target.category, description: target.description };
      await c.tx.update(files).set({ documentGroupId: groupId, documentStatus: "superseded" }).where(eq(files.id, target.id));
    }
    const [created] = await c.tx.insert(files).values(values).returning();
    if (!supersedesId) {
      const [grouped] = await c.tx.update(files).set({ documentGroupId: created.id }).where(eq(files.id, created.id)).returning();
      return grouped;
    }
    return created;
  }, 201));
  app.put(`${base}/files/:fileId`, ...auth, handle(async (c, req) => {
    const target = c.getFile(id.parse(req.params.fileId));
    const input = fileUpdate.parse(req.body); c.getFolder(input.folderId);
    for (const version of c.group(target)) await c.tx.update(files).set(input).where(eq(files.id, version.id));
    return { ...target, ...input };
  }));
  app.delete(`${base}/files/:fileId`, ...auth, handle(async (c, req) => {
    const target = c.getFile(id.parse(req.params.fileId));
    const scope = z.enum(["version", "document"]).parse(req.query.scope);
    const versions = c.group(target);
    for (const version of scope === "document" ? versions : [target]) await c.tx.update(files).set({ deletedAt: new Date() }).where(eq(files.id, version.id));
    if (scope === "version" && target.documentStatus === "current") {
      const remaining = versions.filter((v: any) => !v.deletedAt && v.id !== target.id).sort((a: any, b: any) => b.documentVersion - a.documentVersion);
      if (remaining.length) await c.tx.update(files).set({ documentStatus: "current" }).where(eq(files.id, remaining[0].id));
    }
  }, 204));
  const batch = async (c: any, input: { fileIds: number[]; folderIds: number[]; action: string; folderId?: number | null }) => {
    input.fileIds.forEach(c.getFile); input.folderIds.forEach(c.getFolder);
    c.getFolder(input.folderId);
    const selectedFolders = new Set<number>();
    for (const folderId of input.folderIds) for (const child of c.descendants(folderId)) selectedFolders.add(child as number);
    if (input.action === "move" && input.folderId != null && selectedFolders.has(input.folderId)) throw new DocumentError(400, "A folder cannot be moved inside itself");
    const selectedFiles = new Set<number>();
    for (const file of c.allFiles) {
      if (input.fileIds.includes(file.id) || (input.action === "delete" && selectedFolders.has(file.folderId))) {
        for (const v of c.group(file)) selectedFiles.add(v.id);
      }
    }
    for (const fileId of selectedFiles) await c.tx.update(files).set(input.action === "delete" ? { deletedAt: new Date() } : { folderId: input.folderId ?? null }).where(eq(files.id, fileId));
    for (const folderId of input.action === "delete" ? selectedFolders : input.folderIds) await c.tx.update(folders).set(input.action === "delete" ? { deletedAt: new Date() } : { parentId: input.folderId ?? null }).where(eq(folders.id, folderId));
    return { success: true };
  };
  app.post(`${base}/batch`, ...auth, handle(async (c, req) => batch(c, z.object({
    fileIds: z.array(z.number().int().positive()), folderIds: z.array(z.number().int().positive()),
    action: z.enum(["delete", "move"]), folderId: nullableId.optional(),
  }).parse(req.body))));
  app.delete(`${base}/folders/:folderId`, ...auth, handle(async (c, req) => batch(c, { fileIds: [], folderIds: [id.parse(req.params.folderId)], action: "delete" }), 204));
}
