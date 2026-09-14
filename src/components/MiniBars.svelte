<script lang="ts">
  import type { Overview } from "$lib/types";
  let { data }: { data: Overview["trend"] } = $props();
  let days = $derived(data.slice(-5));
  let max = $derived(
    Math.max(
      1,
      ...days.flatMap((d) => [
        Math.abs(Number(d.income)),
        Math.abs(Number(d.expense)),
      ]),
    ),
  );
</script>

<svg viewBox="0 0 100 36" class="h-8 w-24" aria-hidden="true">
  {#each days as day, i}<rect
      x={i * 20 + 2}
      y={18 - (Math.max(0, Number(day.income)) / max) * 16}
      width="6"
      height={(Math.abs(Number(day.income)) / max) * 16}
      rx="2"
      fill="var(--cash-in)"
    /><rect
      x={i * 20 + 10}
      y={18 - (Math.max(0, Number(day.expense)) / max) * 16}
      width="6"
      height={(Math.abs(Number(day.expense)) / max) * 16}
      rx="2"
      fill="var(--cash-out)"
    />{/each}
</svg>
