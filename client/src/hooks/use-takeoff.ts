import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AISettings, LearnedRule, RunDocument, RunStatus, TokenUsage } from "@shared/estimating/takeoff";
export interface PublicRun {
  id: number; opportunityId: number; createdBy: string; status: RunStatus;
  revisionId: number | null; error: string | null; createdAt: string; startedAt: string | null; finishedAt: string | null;
  model: string; cost: number; steps: number; budget: number; stepLimit: number; usage: TokenUsage;
  progress: { at: string; message: string }[]; documents: Omit<RunDocument, "objectPath" | "snapshotPath">[];
  instructions: string; trades: string[]; playbookVersion: number; summary?: string; questions: string[];
  flags: { type: string; lineId: string; categoryId: string; description: string; flag: string }[];
}
export interface TakeoffDocument { id: number; name: string; contentType: string; source: string }
export interface SheetInfo { page: number; title: string; sheetNumber: string; scaleText: string[]; vector: boolean; width: number; height: number }
export interface PlaybookVersion { id: number; markdown: string; createdAt: string; createdBy: string; restoredFrom: number | null }
export async function takeoffRequest<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || "Takeoff request failed");
  return data;
}
export const takeoffRoot = (id: number) => `/api/opportunities/${id}/takeoff`;
export function useTakeoffRuns(id: number) {
  return useQuery({ queryKey: [takeoffRoot(id), "runs"], queryFn: () => takeoffRequest<PublicRun[]>(`${takeoffRoot(id)}/runs`), refetchInterval: 3000 });
}
export function useTakeoffDocuments(id: number) {
  return useQuery({ queryKey: [takeoffRoot(id), "documents"], queryFn: () => takeoffRequest<TakeoffDocument[]>(`${takeoffRoot(id)}/documents`) });
}
export function useTakeoffAction(id: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ action, data }: { action: string; data?: unknown }) => takeoffRequest<PublicRun>(`${takeoffRoot(id)}/${action}`, "POST", data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [takeoffRoot(id)] }); qc.invalidateQueries({ queryKey: [`/api/opportunities/${id}/estimates`] }); } });
}
export function useTakeoffPlaybook() {
  return useQuery({ queryKey: ["/api/takeoff-playbook"], queryFn: () => takeoffRequest<{ versions: PlaybookVersion[]; rules: LearnedRule[] }>("/api/takeoff-playbook") });
}
export function useTakeoffSettings() {
  return useQuery({ queryKey: ["/api/admin/estimating-ai"], queryFn: () => takeoffRequest<{ settings: AISettings; version: number; monthSpend: number; runs: PublicRun[] }>("/api/admin/estimating-ai") });
}
