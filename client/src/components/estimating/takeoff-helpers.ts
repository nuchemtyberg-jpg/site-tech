import type { TakeoffConfig } from "./use-takeoff-management";
import type { PublicRun } from "@/hooks/use-takeoff";

// This is a planning heuristic, not a quote. Re-reading sheets, tool output and
// cached context can change actual usage substantially.
export function estimateTakeoffUsage(pages: number, config: TakeoffConfig) {
  const inputTokens = pages * config.estimatedInputPerPage + 12000;
  if (!config.prices) return { inputTokens, low: null, high: null };
  const { input, output, cacheRead, cacheWrite } = config.prices;
  // Include repeated cached context, fresh tool input and substantial output on
  // every step. Do not truncate this planning range to the user's spending cap.
  const scenario = (steps: number, prompt: number, fresh: number, out: number) =>
    (inputTokens * cacheWrite + steps * (prompt * cacheRead + fresh * input + out * output)) / 1_000_000;
  const low = scenario(40, inputTokens, 3000, 2500);
  const high = scenario(120, inputTokens * 2, 10000, 6000);
  return { inputTokens, low, high };
}
export const usd = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(value);
export function elapsedRun(run: PublicRun, now = Date.now()) {
  const start = Date.parse(run.startedAt || run.createdAt);
  const end = run.finishedAt ? Date.parse(run.finishedAt) : now;
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
export function runStatusLabel(status: PublicRun["status"]) {
  return ({ queued: "Queued", running: "Running", needs_review: "Ready for review", completed: "Reviewed", failed: "Failed", stopped_at_cap: "Spending approval needed", cancelled: "Cancelled" })[status];
}
