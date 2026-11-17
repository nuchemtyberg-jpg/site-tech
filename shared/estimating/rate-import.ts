import type { EstimateRates } from "./model";

export const RATE_TABS = ["Materials", "Labor", "Equipment", "Markups"] as const;
export type RateTab = typeof RATE_TABS[number];
export type RateImportInput =
  | { source: "spreadsheet"; files: { name: string; data: string; tab?: RateTab }[] }
  | { source: "estimate"; rates: EstimateRates; replaceDefaultMarkups: boolean };
export interface RateChange {
  section: RateTab;
  label: string;
  status: "new" | "changed" | "unchanged";
  before?: Record<string, string>;
  after: Record<string, string>;
}
export interface RatePreview {
  version: number;
  changes: RateChange[];
  counts: { new: number; changed: number; unchanged: number };
  errors: string[];
  warnings: string[];
  token?: string;
}
export interface RateHistoryEntry {
  id: number;
  version: number;
  savedBy: string;
  author: string;
  savedAt: string;
  source: string;
}
export interface RateHistoryDetail extends RateHistoryEntry { rates: EstimateRates }
