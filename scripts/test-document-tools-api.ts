/**
 * Self-cleaning authenticated HTTP regression suite for both Documents tools.
 * Uses only isolated fixture owners/users; never edits existing business rows.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { db } from "../server/db";
import { files, folders, projects, opportunities, customers, users, activityLogs } from "../shared/schema";
import { checkDocumentsBrowser } from "./document-tools-browser";
import { eq, sql } from "drizzle-orm";
import { ObjectStorageService } from "../server/replit_integrations/object_storage/objectStorage";

const base = process.env.TEST_BASE_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;
const token = crypto.randomUUID();
const userId = `doc-test-${token}`;
const sid = crypto.randomUUID();
const ownerIds: { project: number[]; opportunity: number[] } = { project: [], opportunity: [] };
let customerId: number | undefined;
let count = 0;
const uploadedObjects: string[] = [];
function check(value: unknown, label: string) { assert.ok(value, label); count++; console.log(`PASS ${label}`); }
async function main() {
  try {
    await db.insert(users).values({ id: userId, email: `${userId}@example.invalid`, firstName: "Document", lastName: "Tester", role: "user", isAuthorized: "approved" });
    const session = { cookie: { originalMaxAge: 3600000, expires: new Date(Date.now() + 3600000).toISOString(), httpOnly: true, path: "/" }, passport: { user: { claims: { sub: userId }, expires_at: Math.floor(Date.now()/1000) + 3600 } } };
    await db.execute(sql`INSERT INTO sessions (sid,sess,expire) VALUES (${sid},${JSON.stringify(session)}::jsonb,NOW()+interval '1 hour')`);
    const signature = crypto.createHmac("sha256", process.env.SESSION_SECRET!).update(sid).digest("base64").replace(/=+$/, "");
    const headers = { Cookie: `connect.sid=${encodeURIComponent(`s:${sid}.${signature}`)}`, "Content-Type": "application/json" };
    const upload = async (text: string) => {
      const response = await fetch(`${base}/api/uploads/request-url`, { method: "POST", headers, body: JSON.stringify({ name: "fixture.txt", size: text.length, contentType: "text/plain" }) });
      assert.equal(response.status, 200);
      const { uploadURL, objectPath } = await response.json();
      const put = await fetch(uploadURL, { method: "PUT", body: text, headers: { "Content-Type": "text/plain" } });
      assert.ok(put.ok); uploadedObjects.push(objectPath);
      return objectPath;
    };
    const originalPath = await upload("original document bytes");
    const revisionPath = await upload("revision document bytes");
    const [customer] = await db.insert(customers).values({ name: `__DOC_TOOLS_${token}` }).returning(); customerId = customer.id;
    for (let i = 0; i < 2; i++) {
      const sameId = crypto.randomInt(1000000000, 2000000000);
      const [project] = await db.insert(projects).values({ id: sameId, name: `__DOC_TOOLS_${token}`, status: "active", customerId }).returning(); ownerIds.project.push(project.id);
      const [opp] = await db.insert(opportunities).values({ id: sameId, name: `__DOC_TOOLS_${token}`, customerId, opportunityNumber: `TEST-${token}-${i}`, status: "new" }).returning(); ownerIds.opportunity.push(opp.id);
    }
    for (const type of ["project", "opportunity"] as const) {
      const path = `/api/document-tools/${type}/${ownerIds[type][0]}`;
      const other = `/api/document-tools/${type}/${ownerIds[type][1]}`;
      const request = async (suffix: string, method = "GET", data?: unknown, root = path) => {
        const response = await fetch(base + root + suffix, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) });
        return { status: response.status, body: await response.json().catch(() => null) };
      };
      check((await fetch(base + path + "/files")).status === 401, `${type}: authentication required`);
      const folder = (await request("/folders", "POST", { name: "Plans" })).body;
      const nested = (await request("/folders", "POST", { name: "Nested", parentId: folder.id })).body;
      check((await request(`/folders/${folder.id}`, "PUT", { parentId: nested.id })).status === 400, `${type}: cycles rejected`);
      check((await request("/files", "POST", { name: "foreign", objectPath: "/objects/test", folderId: folder.id }, other)).status === 404, `${type}: foreign folder rejected`);
      const legacyValues = { name: "legacy.pdf", objectPath: originalPath, folderId: nested.id, tags: ["bid"], starred: true, category: "plans", description: "Keep metadata", uploadedByUserId: userId,
        ...(type === "project" ? { projectId: ownerIds[type][0] } : { relatedEntityType: "opportunity", relatedEntityId: ownerIds[type][0] }) };
      const [legacy] = await db.insert(files).values(legacyValues).returning();
      const newBody = { name: "revision.pdf", objectPath: revisionPath, supersedesId: legacy.id };
      const race = await Promise.all([request("/files", "POST", newBody), request("/files", "POST", newBody)]);
      check(race.filter(r => r.status === 201).length === 1 && race.filter(r => r.status === 409).length === 1, `${type}: concurrent legacy revisions yield one current`);
      const revision = race.find(r => r.status === 201)!.body;
      const crossType = `/api/document-tools/${type === "project" ? "opportunity" : "project"}/${ownerIds[type][0]}`;
      check((await request(`/files/${revision.id}`, "PUT", { starred: false }, crossType)).status === 404, `${type}: identical numeric owner IDs cannot cross entity types`);
      for (const [path, expected] of [[originalPath, "original document bytes"], [revisionPath, "revision document bytes"]]) {
        const download = await fetch(base + path + "?download=true&filename=fixture.txt", { headers });
        check(download.ok && await download.text() === expected && download.headers.get("content-disposition")?.includes("attachment"), `${type}: current/history download preserves bytes`);
      }
      check(revision.documentVersion === 2 && revision.folderId === nested.id && revision.starred && revision.tags[0] === "bid" && revision.category === "plans" && revision.description === "Keep metadata", `${type}: revision inherits legacy organization and metadata`);
      check((await request("/files", "POST", newBody)).status === 409, `${type}: stale revision rejected`);
      check((await request(`/files/${revision.id}`, "PUT", { name: "intruder" }, other)).status === 404, `${type}: foreign document rejected`);
      check((await request(`/files/${revision.id}?scope=document`, "DELETE", undefined, other)).status === 404, `${type}: foreign deletion rejected`);
      await request(`/files/${revision.id}`, "PUT", { name: "renamed.pdf", tags: ["updated"], starred: false, folderId: folder.id });
      let list = (await request("/files")).body;
      check(list.length === 2 && list.every((f: any) => f.name === "renamed.pdf" && f.folderId === folder.id && f.tags[0] === "updated" && !f.starred), `${type}: metadata applies across history and persists`);
      check(list.every((f: any) => f.uploaderName === "Document Tester"), `${type}: uploader enrichment retained`);
      if (process.env.TEST_DOCUMENT_BROWSER === "1") await checkDocumentsBrowser(base, headers.Cookie, type, ownerIds[type][0], folder.id, revision.id);
      await request(`/files/${revision.id}?scope=version`, "DELETE");
      list = (await request("/files")).body;
      check(list.length === 1 && list[0].id === legacy.id && list[0].documentStatus === "current", `${type}: deleting current promotes prior`);
      const third = (await request("/files", "POST", { ...newBody, objectPath: `/objects/${token}/third-${type}` })).body;
      check(third.documentVersion === 3, `${type}: numbers remain monotonic after deletion`);
      const separate = (await request("/files", "POST", { name: "renamed.pdf", objectPath: `/objects/${token}/separate-${type}`, folderId: nested.id })).body;
      check(separate.documentVersion === 1 && separate.documentGroupId !== third.documentGroupId, `${type}: matching names are independent documents`);
      check((await request("/batch", "POST", { fileIds: [third.id], folderIds: [folder.id], action: "move", folderId: nested.id })).status === 400, `${type}: atomic batch cycle rejection`);
      await request("/batch", "POST", { fileIds: [third.id], folderIds: [], action: "move", folderId: nested.id });
      list = (await request("/files")).body;
      check(list.every((f: any) => f.folderId === nested.id), `${type}: bulk move includes history`);
      await request(`/folders/${folder.id}`, "DELETE");
      check((await request("/files")).body.length === 0 && (await request("/folders")).body.length === 0, `${type}: recursive folder deletion cannot resurrect history`);
      const whole = (await request("/files", "POST", { name: "whole", objectPath: `/objects/${token}/whole-${type}` })).body;
      await request("/files", "POST", { name: "whole", objectPath: `/objects/${token}/whole2-${type}`, supersedesId: whole.id });
      await request(`/files/${whole.id}?scope=document`, "DELETE");
      check((await request("/files")).body.length === 0, `${type}: whole document deletion removes history`);
    }
    console.log(`${count} assertions passed`);
  } finally {
    await db.delete(activityLogs).where(eq(activityLogs.actorUserId, userId));
    for (const projectId of ownerIds.project) { await db.delete(files).where(eq(files.projectId, projectId)); await db.delete(folders).where(eq(folders.projectId, projectId)); await db.delete(projects).where(eq(projects.id, projectId)); }
    for (const opportunityId of ownerIds.opportunity) { await db.execute(sql`DELETE FROM files WHERE related_entity_type='opportunity' AND related_entity_id=${opportunityId}`); await db.delete(folders).where(eq(folders.opportunityId, opportunityId)); await db.delete(opportunities).where(eq(opportunities.id, opportunityId)); }
    if (customerId) await db.delete(customers).where(eq(customers.id, customerId));
    await db.execute(sql`DELETE FROM sessions WHERE sid=${sid}`);
    await db.delete(users).where(eq(users.id, userId));
    for (const path of uploadedObjects) {
      const object = await new ObjectStorageService().getObjectEntityFile(path);
      await object.delete();
    }
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
