import type { QueryClient } from "@tanstack/svelte-query";

// Session data changes through saves or an explicit page reload. Keep source
// rows in the same cache as pages so logout clears everything, including reads
// that were still in flight. Do not refetch a whole report on network reconnect.
export const sessionQueryOptions = {
  staleTime: Infinity,
  gcTime: Infinity,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

export function reportTime(cache: QueryClient) {
  const key = ["overview", "snapshot"];
  const state = cache.getQueryState<string>(key);
  const now = new Date().toISOString();
  const day = (at: string) =>
    new Date(Date.parse(at) + 8 * 3600000).toISOString().slice(0, 10);
  if (state?.data && !state.isInvalidated && day(state.data) === day(now))
    return state.data;
  if (state?.data && day(state.data) !== day(now))
    void cache.invalidateQueries({
      queryKey: ["overview"],
      refetchType: "none",
    });
  cache.setQueryDefaults(key, sessionQueryOptions);
  cache.setQueryData(key, now);
  return now;
}
