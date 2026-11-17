import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { takeoffRequest, takeoffRoot, type SheetInfo } from "@/hooks/use-takeoff";
import type { AISettings, LearnedRule } from "@shared/estimating/takeoff";

export interface TakeoffConfig { model: string; mode?: "agent" | "single" | "sectioned"; maxCost: number; maxSteps: number; estimatedInputPerPage: number; prices?: { input: number; output: number; cacheRead: number; cacheWrite: number } }
export function useTakeoffConfig(id: number) {
  return useQuery({ queryKey: [takeoffRoot(id), "config"], queryFn: () => takeoffRequest<TakeoffConfig>(`${takeoffRoot(id)}/config`) });
}
export function useTakeoffSheets(id: number, fileId: number, enabled: boolean) {
  return useQuery({ queryKey: [takeoffRoot(id), "documents", fileId, "sheets"], queryFn: () => takeoffRequest<{status?:string; pages: SheetInfo[] }>(`${takeoffRoot(id)}/documents/${fileId}/sheets`), enabled,
    refetchInterval:query=>["queued","processing"].includes(query.state.data?.status||"")?2000:false });
}
export function useSavePlaybook() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: { markdown: string; restoredFrom?: number }) => takeoffRequest("/api/takeoff-playbook", "POST", data),
    onSuccess: () => client.invalidateQueries({ queryKey: ["/api/takeoff-playbook"] }),
  });
}
export function useSaveLearnedRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Pick<LearnedRule, "text" | "appliesTo" | "active" | "sourceNote"> & { id?: number }) => takeoffRequest(`/api/takeoff-playbook/rules${id ? `/${id}` : ""}`, id ? "PUT" : "POST", data),
    onSuccess: () => client.invalidateQueries({ queryKey: ["/api/takeoff-playbook"] }),
  });
}
export function useSaveTakeoffSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: { settings: AISettings; version: number }) => takeoffRequest("/api/admin/estimating-ai", "PUT", data),
    onSuccess: () => client.invalidateQueries({ queryKey: ["/api/admin/estimating-ai"] }),
  });
}
