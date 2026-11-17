import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";

export function takeoffDiagnostic(stage: string, fields: Record<string, unknown> = {}) {
  const m = process.memoryUsage();
  console.info(JSON.stringify({ event: "takeoff", stage, at: new Date().toISOString(), pid: process.pid,
    rssMiB: +(m.rss / 1048576).toFixed(1), heapMiB: +(m.heapUsed / 1048576).toFixed(1),
    peakRssMiB: +(process.resourceUsage().maxRSS / 1024).toFixed(1), ...fields }));
}
export const takeoffRequestDiagnostics: RequestHandler = (req, res, next) => {
  const requestId = randomUUID(), started = performance.now();
  const fields = { requestId, method: req.method, path: req.path };
  res.setHeader("X-Takeoff-Request-ID", requestId);
  takeoffDiagnostic("request.arrived", fields);
  res.once("finish", () => takeoffDiagnostic("request.finished", { ...fields, status: res.statusCode, ms: Math.round(performance.now() - started) }));
  res.once("close", () => { if (!res.writableFinished) takeoffDiagnostic("request.aborted", { ...fields, ms: Math.round(performance.now() - started) }); });
  next();
};
let installed = false;
export function installTakeoffProcessDiagnostics() {
  if (installed) return; installed = true;
  process.on("uncaughtExceptionMonitor", error => takeoffDiagnostic("process.uncaught", { message: error.message }));
  process.on("exit", code => takeoffDiagnostic("process.exit", { code }));
}
