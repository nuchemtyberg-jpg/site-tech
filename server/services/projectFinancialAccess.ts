import { and, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { projectContracts } from "@shared/schema";

/** Only new Projects created from an award inherit restricted bid finances.
 * Existing operational Projects with additional contracts keep their policy.
 * Award snapshots are immutable, so origin cannot drift with later bid edits.
 */
export async function awardDerivedProjectIds(ids: number[]): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const origins = await db.select({ projectId: projectContracts.projectId }).from(projectContracts).where(and(
    inArray(projectContracts.projectId, ids),
    sql`${projectContracts.snapshot}->>'targetProjectId' IS NULL`,
  ));
  return new Set(origins.map(origin => origin.projectId));
}

export async function projectViewsForUser<T extends { id: number; estimatedValue: number | null }>(
  user: { role: string | null } | undefined, rows: T[],
): Promise<(T & { financialValuesRestricted: boolean })[]> {
  const restricted = await awardDerivedProjectIds(rows.map(row => row.id));
  return rows.map(row => ({
    ...row,
    financialValuesRestricted: restricted.has(row.id),
    estimatedValue: user?.role === "admin" || !restricted.has(row.id) ? row.estimatedValue : null,
  }));
}

export async function projectViewForUser<T extends { id: number; estimatedValue: number | null }>(
  user: { role: string | null } | undefined, project: T,
) {
  return (await projectViewsForUser(user, [project]))[0];
}
