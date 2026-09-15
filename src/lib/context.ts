import { getContext, setContext } from "svelte";
import { createQuery } from "@tanstack/svelte-query";
import { sessionQueryOptions } from "./query-cache";
import type { Repository } from "./api";
const repositoryKey = Symbol("financial.repository");
export function setRepository(api: Repository) {
  setContext(repositoryKey, api);
}
export function useApi(): Repository {
  const api = getContext<Repository>(repositoryKey);
  if (!api) throw new Error("Missing API provider");
  return api;
}
export function useAccounts(enabled: () => boolean = () => true) {
  const api = useApi();
  return createQuery(() => ({
    queryKey: ["accounts"],
    queryFn: () => api.accounts(),
    ...sessionQueryOptions,
    enabled: enabled(),
  }));
}
