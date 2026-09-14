import { createQuery, useQueryClient } from "@tanstack/svelte-query";
import { useApi } from "./context";
import { effectiveEnd, type Repository } from "./api";

export const reportStaleTime = 30_000;

// Keep exact query boundaries stable during quick navigation. Saving invalidates
// this snapshot together with the reports; logout clears the whole QueryClient.
export function useReportTime() {
  const cache = useQueryClient();
  const key = ["overview", "snapshot"];
  const state = cache.getQueryState<string>(key);
  if (
    state?.data &&
    !state.isInvalidated &&
    Date.now() - state.dataUpdatedAt < reportStaleTime
  )
    return state.data;
  const now = new Date().toISOString();
  cache.setQueryData(key, now);
  return now;
}

export function useReport<K extends Parameters<Repository["report"]>[0]>(
  part: K,
  period: () => { start: string; end: string; asOf: string },
  enabled: () => boolean = () => true,
) {
  const api = useApi();
  return createQuery(() => {
    const { start, end, asOf } = period();
    const cutoff = effectiveEnd(end, asOf);
    return {
      queryKey: [
        "overview",
        part,
        part === "balance" || part === "accounts" || part === "quality"
          ? null
          : start,
        cutoff,
      ],
      queryFn: () => api.report(part, start, end, asOf),
      enabled: enabled(),
      staleTime: reportStaleTime,
    };
  });
}
