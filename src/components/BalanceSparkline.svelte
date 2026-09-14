<script lang="ts">
  import { createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { useApi } from "$lib/context";
  let { start, end, closing }: { start: string; end: string; closing: string } =
    $props();
  const api = useApi();
  const cache = useQueryClient();
  const query = createQuery(() => ({
    queryKey: ["overview", "balance-trend", start, end],
    queryFn: () =>
      Promise.all(
        Array.from({ length: 5 }, (_, i) => {
          const at = new Date(
            Date.parse(start) + ((Date.parse(end) - Date.parse(start)) * i) / 5,
          ).toISOString();
          return cache
            .fetchQuery({
              queryKey: ["overview", "balance", null, at],
              queryFn: () => api.balance(at),
              staleTime: 300_000,
            })
            .then((r) => r.net_assets);
        }),
      ),
    enabled: Date.parse(end) > Date.parse(start),
    staleTime: 300_000,
  }));
  let values = $derived(query.data ? [...query.data, closing].map(Number) : []);
  let low = $derived(Math.min(...values));
  let span = $derived(Math.max(1, Math.max(...values) - low));
  let points = $derived(
    values.map((v, i) => `${i * 60},${75 - ((v - low) / span) * 60}`).join(" "),
  );
</script>

{#if query.data && !query.error}
  <svg
    viewBox="0 0 300 100"
    preserveAspectRatio="none"
    class="h-24 w-full text-cash-in"
    aria-hidden="true"
    ><polygon
      points={`0,100 ${points} 300,100`}
      fill="currentColor"
      opacity="0.08"
    /><polyline
      {points}
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      vector-effect="non-scaling-stroke"
    /></svg
  >
{/if}
