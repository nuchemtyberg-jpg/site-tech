import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { type EstimateJob, type EstimateRates, type EstimateRevision } from "@shared/estimating/model";
export type { EstimateJob, EstimateRates, EstimateRevision };
export class EstimateApiError extends Error {
  constructor(public status: number, public body: any) { super(body.message || "Estimate request failed"); }
}
async function request<T>(url: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(url, { method, credentials: "include", headers: { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) });
  const body = await response.json();
  if (!response.ok) throw new EstimateApiError(response.status, body);
  return body;
}
const root = (id: number) => `/api/opportunities/${id}/estimates`;
export function useEstimatingRates() {
  return useQuery({ queryKey: ["/api/estimating-rates"], queryFn: () => request<{ rates: EstimateRates; version: number }>("/api/estimating-rates") });
}
export function useSaveEstimatingRates() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data: { rates: EstimateRates; version: number }) => request("/api/estimating-rates", "PUT", data), onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/estimating-rates"] }) });
}
export function useEstimateRevisions(opportunityId: number) {
  return useQuery({ queryKey: [root(opportunityId)], queryFn: () => request<Omit<EstimateRevision, "job">[]>(root(opportunityId)) });
}
export function useEstimateRevision(opportunityId: number, revisionId?: number) {
  return useQuery({ queryKey: [root(opportunityId), revisionId], enabled: !!revisionId, queryFn: () => request<EstimateRevision>(`${root(opportunityId)}/${revisionId}`) });
}
export function useSaveEstimate(opportunityId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { revisionId?: number; job?: EstimateJob; version?: number; name?: string; start?: boolean; importFile?: unknown }) => {
      const { revisionId, ...body } = data;
      return request<EstimateRevision>(`${root(opportunityId)}${revisionId ? `/${revisionId}` : ""}`, revisionId ? "PUT" : "POST", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [root(opportunityId)] });
      qc.invalidateQueries({ predicate: query => typeof query.queryKey[0] === "string" && query.queryKey[0].startsWith("/api/opportunities") });
    },
  });
}
