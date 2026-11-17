import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { EstimateRates } from "@shared/estimating/model";
import type { RateHistoryDetail, RateHistoryEntry, RateImportInput, RatePreview } from "@shared/estimating/rate-import";

export type CompanyRatesResult = { rates: EstimateRates; version: number };
const companyKey = ["/api/estimating-rates"];
const historyKey = ["/api/estimating-rates/history"];
async function rateRequest<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api/estimating-rates${path}`, {
    method: data === undefined ? "GET" : "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message || `Rate request failed (${response.status}). Please retry.`);
  if (body === null) throw new Error("The server returned an unreadable response. Please retry.");
  return body as T;
}
export function usePreviewRateImport() {
  return useMutation({ mutationFn: (input: RateImportInput) => rateRequest<RatePreview>("/preview", input) });
}
export function useApplyRateImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => rateRequest<CompanyRatesResult>("/apply", { token }),
    onSuccess: result => {
      qc.setQueryData(companyKey, result);
      void qc.invalidateQueries({ queryKey: companyKey });
      void qc.invalidateQueries({ queryKey: historyKey });
    },
  });
}
export function useRateHistory(enabled = true) {
  return useQuery({ queryKey: historyKey, enabled, queryFn: () => rateRequest<RateHistoryEntry[]>("/history") });
}
export function useRateHistoryDetail(id?: number) {
  return useQuery({ queryKey: [...historyKey, id], enabled: id !== undefined, queryFn: () => rateRequest<RateHistoryDetail>(`/history/${id}`) });
}
