import { createQuery, useQueryClient } from "@tanstack/svelte-query";
import { useApi } from "./context";
import { effectiveEnd, type Repository } from "./api";

import { reportTime, sessionQueryOptions } from "./query-cache";

export function useReportTime() {
  return reportTime(useQueryClient());
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
      ...sessionQueryOptions,
    };
  });
}
