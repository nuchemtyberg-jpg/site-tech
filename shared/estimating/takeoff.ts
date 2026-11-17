import { z } from "zod";
import type { EstimateJob, EstimateRates } from "./model";

export const AI_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5"] as const;
export const TRADES = ["SOE", "Structural Piles", "Excavation", "Site work"] as const;
const prices = z.object({
  input: z.number().positive(), output: z.number().positive(),
  cacheRead: z.number().nonnegative(), cacheWrite: z.number().positive(),
});
export const aiSettingsSchema = z.object({
  model: z.enum(AI_MODELS).default("claude-opus-5-5"),
  maxCost: z.number().min(0.1).max(10000).default(25),
  maxSteps: z.number().int().min(1).max(1000).default(150),
  prices: z.object({
    "claude-opus-5-5": prices.default({ input: 4, output: 20, cacheRead: .2, cacheWrite: 5 }),
    "claude-sonnet-5-5": prices.default({ input: 2, output: 10, cacheRead: .1, cacheWrite: 2.5 }),
  }).default({}),
});
export type AISettings = z.infer<typeof aiSettingsSchema>;
export const learnedRuleSchema = z.object({
  text: z.string().trim().min(1).max(10000),
  appliesTo: z.string().trim().min(1).max(100).default("All"),
  active: z.boolean().default(true),
  sourceNote: z.string().max(2000).default(""),
});
export type LearnedRule = z.infer<typeof learnedRuleSchema> & { id: number; createdAt: string; addedBy: string };
export const selectionSchema = z.object({
  fileId: z.number().int().positive(), pages: z.array(z.number().int().positive()).min(1).max(500),
});
export const startTakeoffSchema = z.object({
  documents: z.array(selectionSchema).min(1).max(30),
  instructions: z.string().max(20000).default(""),
  trades: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  revisionId: z.number().int().positive().optional(),
  approvedBudget: z.number().min(.1).max(10000),
  approvedSteps: z.number().int().min(1).max(1000),
});
export type RunStatus = "queued" | "running" | "needs_review" | "completed" | "failed" | "stopped_at_cap" | "cancelled";
export interface RunDocument {
  fileId: number; name: string; contentType: string; objectPath: string;
  pages: number[]; sha256: string; snapshotPath: string;
}
export interface TokenUsage { input: number; output: number; cacheRead: number; cacheWrite: number }
export type AddedMaterialRate = EstimateRates["rates"][number] & { computedValue: number | null };
export interface TakeoffState {
  documents: RunDocument[];
  instructions: string;
  trades: string[];
  settings: AISettings;
  playbook: { id: number | null; version: number; markdown: string };
  rules: LearnedRule[];
  job: EstimateJob;
  /** Original immutable rate snapshot, before any Claude-created material keys. */
  originalRates?: EstimateRates;
  /** Durable selected-page indexes; independent of outbound conversation pruning. */
  sheetIndexes?: Record<string, unknown[]>;
  modelLimits?: { input: number; output: number };
  messages: unknown[];
  scales: Record<string, { feetPerPoint: number; method: string }>;
  usage: TokenUsage;
  cost: number;
  steps: number;
  budget: number;
  stepLimit: number;
  progress: { at: string; message: string }[];
  summary?: string;
  questions?: string[];
  reviewedBy?: string;
  reviewedAt?: string;
  retryAt?: string;
  retries?: number;
  pendingCall?: { reservation: number; startedAt: string };
  costEvents?: { at: string; amount: number; uncertain?: boolean }[];
  capSubmission?: boolean;
}
export function usageCost(usage: TokenUsage, price: AISettings["prices"][typeof AI_MODELS[number]]) {
  return (usage.input * price.input + usage.output * price.output +
    usage.cacheRead * price.cacheRead + usage.cacheWrite * price.cacheWrite) / 1_000_000;
}
