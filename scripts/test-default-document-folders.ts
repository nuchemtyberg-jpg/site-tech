import assert from "node:assert/strict";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { ensureDefaultDocumentFolders } from "../server/defaultDocumentFolders";

async function main() {
  const rollback = new Error("rollback fixtures");
  try {
    await db.transaction(async tx => {
      const id = 2100000001;
      const before = await tx.execute(sql`SELECT id FROM folders WHERE project_id=${id} OR opportunity_id=${id}`);
      assert.equal(before.rows.length, 0, "fixture owner must be unused");
      await ensureDefaultDocumentFolders(tx, "project", id);
      await ensureDefaultDocumentFolders(tx, "opportunity", id);
      const list = async (type: string) => (await tx.execute(sql`SELECT d.id,d.name,p.name as parent FROM folders d LEFT JOIN folders p ON p.id=d.parent_id WHERE ${type === "project" ? sql`d.project_id=${id}` : sql`d.opportunity_id=${id}`} ORDER BY d.name`)).rows;
      const project = await list("project");
      const opportunity = await list("opportunity");
      assert.equal(project.length, 13);
      assert.deepEqual(project.map(({ name, parent }) => ({ name, parent })), opportunity.map(({ name, parent }) => ({ name, parent })));
      await ensureDefaultDocumentFolders(tx, "opportunity", id);
      assert.deepEqual(await list("opportunity"), opportunity, "repeated initialization preserves IDs");
      await tx.execute(sql`UPDATE folders SET deleted_at=now() WHERE id=${opportunity[0].id}`);
      await ensureDefaultDocumentFolders(tx, "opportunity", id);
      assert.deepEqual(await list("opportunity"), opportunity, "deleted presets are not recreated");
      console.log("PASS: identical 13-folder trees, isolated owners, idempotent IDs, no recreated deleted folders");
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
