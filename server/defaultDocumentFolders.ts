import { sql } from "drizzle-orm";
import type { db } from "./db";

export const DEFAULT_DOCUMENT_FOLDERS = [
  ["Office", null], ["Takeoffs", "Office"], ["Proposals", "Office"],
  ["Supplier Quotes", "Office"], ["Billing", "Office"],
  ["Change Orders", "Billing"], ["SOV", "Billing"], ["REQs & Invoices", "Billing"],
  ["Field", null], ["Drawings", "Field"], ["Permits & Legal", "Field"],
  ["Submittals", "Field"], ["RFI's", "Field"],
] as const;

/** Call inside a transaction. Existing folders (even deleted ones) are never reset. */
export async function ensureDefaultDocumentFolders(tx: Pick<typeof db, "execute">, type: "project" | "opportunity", id: number) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`document-presets:${type}:${id}`}))`);
  const owner = type === "project" ? sql`project_id = ${id} AND opportunity_id IS NULL` : sql`opportunity_id = ${id} AND project_id IS NULL`;
  const ids = new Map<string, number>();
  for (const [name, parentName] of DEFAULT_DOCUMENT_FOLDERS) {
    const parentId = parentName ? ids.get(parentName)! : null;
    const existing = await tx.execute(sql`SELECT id FROM folders WHERE ${owner} AND name = ${name} AND parent_id IS NOT DISTINCT FROM ${parentId} ORDER BY deleted_at NULLS FIRST, id LIMIT 1`);
    let folderId = existing.rows[0]?.id as number | undefined;
    if (!folderId) {
      const created = await tx.execute(sql`INSERT INTO folders (project_id, opportunity_id, name, parent_id) VALUES (${type === "project" ? id : null}, ${type === "opportunity" ? id : null}, ${name}, ${parentId}) RETURNING id`);
      folderId = created.rows[0].id as number;
    }
    ids.set(name, folderId);
  }
}
