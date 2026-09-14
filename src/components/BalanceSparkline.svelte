<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import { useApi } from "$lib/context";
  let {
    start,
    end,
    closing,
    values: supplied,
  }: {
    start: string;
    end: string;
    closing: string;
    values?: string[];
  } = $props();
  const api = useApi();
  const query = createQuery(() => ({
    queryKey: ["overview", "balance-trend", start, end],
    queryFn: () => api.report("balanceHistory", start, end, end),
    enabled: !supplied && Date.parse(end) > Date.parse(start),
    staleTime: 300_000,
  }));
  let values = $derived(
    supplied?.map(Number) ??
      (query.data ? query.data.map((row) => Number(row.net_assets)) : []),
  );
  let low = $derived(Math.min(...values));
  let span = $derived(Math.max(1, Math.max(...values) - low));
  let points = $derived(
    values
      .map(
        (v, i) =>
          `${(i * 300) / Math.max(1, values.length - 1)},${75 - ((v - low) / span) * 60}`,
      )
      .join(" "),
  );
</script>

{#if supplied || (query.data && !query.error)}
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
