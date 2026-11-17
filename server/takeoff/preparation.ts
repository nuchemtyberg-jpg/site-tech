import { createHash } from "node:crypto";
import { fork } from "node:child_process";
import { resolve } from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, pool } from "../db";
import { takeoffDocumentPreparations } from "@shared/schema";
import type { RunDocument } from "@shared/estimating/takeoff";
import { ObjectStorageService, objectStorageClient } from "../replit_integrations/object_storage/objectStorage";
import { permittedFile, readObject } from "./documents";
import { EstimateError } from "../services/estimating";
import { takeoffDiagnostic } from "./diagnostics";

const storage = new ObjectStorageService();
export type Preparation = typeof takeoffDocumentPreparations.$inferSelect;
/** Metadata + storage-side copy only: no PDF bytes enter the web process. */
export async function pinDocument(opportunityId: number, fileId: number, pages: number[]): Promise<RunDocument> {
  const file = await permittedFile(opportunityId, fileId);
  const prep = await pinSource(fileId, file.name, file.objectPath, file.documentVersion);
  return { fileId, name: file.name, contentType: file.contentType || "application/octet-stream", objectPath: file.objectPath,
    snapshotPath: prep.snapshotPath!, sha256: prep.manifest?.sha256 || "", pages: [...new Set(pages)].sort((a,b)=>a-b),
    preparationKey: prep.key, sourceGeneration: prep.sourceGeneration, documentVersion: file.documentVersion ?? undefined };
}
export async function pinSource(fileId: number, name: string, sourcePath: string, version?: number | null) {
  const started = performance.now();
  const source = await storage.getObjectEntityFile(sourcePath);
  const [metadata] = await source.getMetadata();
  if (Number(metadata.size) > 40 * 1024 * 1024) throw new EstimateError(413, "Document exceeds 40 MB. Split it before starting a takeoff.");
  if (!metadata.generation) throw new Error("Document storage did not return an immutable generation.");
  const generation = String(metadata.generation);
  const key = createHash("sha256").update(JSON.stringify(["pdf-cache-v1", fileId, version, sourcePath, generation])).digest("hex");
  const [existing] = await db.select().from(takeoffDocumentPreparations).where(eq(takeoffDocumentPreparations.key, key));
  if (existing) return existing;
  const directory = storage.getPrivateObjectDir().replace(/^\/|\/$/g, "").split("/");
  const bucket = directory.shift()!;
  const destination = objectStorageClient.bucket(bucket).file([...directory, "takeoff-cache", key, "source"].join("/"));
  // Pin the generation, not whatever bytes happen to exist when the worker runs.
  await source.bucket.file(source.name, { generation }).copy(destination);
  const snapshotPath = `/objects/takeoff-cache/${key}/source`;
  await db.insert(takeoffDocumentPreparations).values({ key, fileId, name, sourcePath, sourceGeneration: generation, snapshotPath }).onConflictDoNothing();
  takeoffDiagnostic("preparation.pinned", { key, fileId, ms: Math.round(performance.now() - started), bytes: Number(metadata.size) });
  return (await db.select().from(takeoffDocumentPreparations).where(eq(takeoffDocumentPreparations.key, key)))[0];
}
export async function getPreparation(key: string) {
  const [row] = await db.select().from(takeoffDocumentPreparations).where(eq(takeoffDocumentPreparations.key, key));
  if (!row) throw new Error("Pinned document preparation is missing.");
  return row;
}
let active = false;
/** Cross-process lock also bounds rendering and preparation to ONE child per database. */
async function isolated(job: Record<string, unknown>) {
  const lock = await pool.connect();
  try {
    const result = await lock.query("SELECT pg_try_advisory_lock(739110) AS locked");
    if (!result.rows[0].locked) return false;
    await new Promise<void>((accept, reject) => {
      const production = process.env.NODE_ENV === "production";
      const child = fork(resolve(production ? "dist/takeoff-preparer.cjs" : "server/takeoff/preparation-child.ts"), [], {
        execArgv: ["--max-old-space-size=768", "--expose-gc", ...(production ? [] : ["--import", "tsx"])],
        stdio: ["ignore", "inherit", "inherit", "ipc"],
      });
      const started = performance.now();
      const timeout = setTimeout(() => child.kill("SIGKILL"), 15 * 60_000);
      child.once("error", error=>{clearTimeout(timeout);reject(error);});
      child.once("exit", (code, signal) => {
        clearTimeout(timeout);
        takeoffDiagnostic("preparation.child.exit", { childPid: child.pid, code, signal, ms: Math.round(performance.now() - started) });
        code === 0 ? accept() : reject(new Error(`Isolated PDF worker exited (${signal || code}). The web server remains available. Try a smaller drawing set or inspect worker memory logs.`));
      });
      child.send(job);
    });
    return true;
  } finally {
    await lock.query("SELECT pg_advisory_unlock(739110)").catch(() => {});
    lock.release();
  }
}
export async function preparationTick() {
  if (active) return; active = true;
  try {
    const [row] = await db.select().from(takeoffDocumentPreparations)
      .where(inArray(takeoffDocumentPreparations.status, ["queued", "processing"]))
      .orderBy(takeoffDocumentPreparations.createdAt).limit(1);
    if (!row) return;
    try { await isolated({ key: row.key }); }
    catch (error) {
      await db.update(takeoffDocumentPreparations).set({ status: "failed", error: error instanceof Error ? error.message : "Preparation failed", updatedAt: new Date() })
        .where(and(eq(takeoffDocumentPreparations.key, row.key), inArray(takeoffDocumentPreparations.status, ["queued", "processing"])));
    }
  } finally { active = false; }
}
export async function preparedDocument(file: RunDocument) {
  if (!file.preparationKey) {
    const pinned = await pinSource(file.fileId, file.name, file.snapshotPath);
    file.preparationKey = pinned.key;
  }
  const row = await getPreparation(file.preparationKey);
  if (row.status === "failed") throw new Error(row.error || "Document preparation failed");
  if (row.status !== "ready" || !row.manifest) throw new Error("Document is still preparing. Retry when preparation completes.");
  if (file.pages.some(p => p > row.manifest!.pageCount)) throw new Error("A selected page does not exist in the pinned document version.");
  return row as Preparation & { manifest: NonNullable<Preparation["manifest"]> };
}
export async function cachedPage(file: RunDocument, page: number) {
  if (!file.pages.includes(page)) throw new Error("Page not selected.");
  const prep = await preparedDocument(file);
  const sheet = prep.manifest.pages.find(p => p.page === page);
  if (!sheet) throw new Error("Prepared page is missing.");
  return sheet;
}
export async function cachedJSON<T>(path: string): Promise<T> {
  return JSON.parse((await readObject(path)).toString("utf8"));
}
export async function isolatedRender(file: RunDocument, page: number, zoom: number, region?: number[]) {
  await cachedPage(file, page);
  // Region render results are immutable and reused as well.
  const variant = createHash("sha256").update(JSON.stringify([file.preparationKey, page, zoom, region])).digest("hex");
  const path = `/objects/takeoff-cache/${file.preparationKey}/render-${variant}.png`;
  const object = await storage.getObjectEntityFile(path).catch(() => null);
  if (object && (await object.exists())[0]) return readObject(path);
  for (let attempt = 0; attempt < 300; attempt++) {
    if (await isolated({ key: file.preparationKey, render: { page, zoom, region, path } })) return readObject(path);
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error("PDF worker is busy preparing another document. Retry this view after preparation.");
}
