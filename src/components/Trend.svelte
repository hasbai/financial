<script lang="ts">
  import type { Overview } from "$lib/types";
  import { dayLink } from "$lib/cashflow";
  import { money } from "$lib/finance";
  let { data }: { data: Overview["trend"] } = $props();
  let max = $derived(
    Math.max(
      1,
      ...data.flatMap((d) => [
        Math.abs(Number(d.income)),
        Math.abs(Number(d.expense)),
      ]),
    ),
  );
  const x = (i: number) => 40 + (i * 720) / Math.max(1, data.length - 1);
  const y = (value: string) => 110 - (Number(value) / max) * 85;
  const points = (key: "income" | "expense") =>
    data.map((d, i) => `${x(i)},${y(d[key])}`).join(" ");
</script>

<div
  class="space-y-3 [--trend-income:var(--chart-3)] dark:[--trend-income:var(--chart-1)]"
>
  <div class="flex gap-5 text-sm">
    <span class="flex items-center gap-2"
      ><span class="h-0.5 w-6 bg-chart-3 dark:bg-chart-1"></span>收入</span
    ><span class="flex items-center gap-2"
      ><span class="h-0.5 w-6 border-t-2 border-dashed border-chart-2"
      ></span>支出</span
    >
  </div>
  <svg
    viewBox="0 0 800 240"
    role="img"
    aria-label="本月完整记录收入及支出趋势，逐日数值见下方趋势明细"
    class="h-60 w-full overflow-visible"
  >
    <line x1="40" x2="760" y1="110" y2="110" stroke="var(--border)" />
    <polyline
      points={points("income")}
      fill="none"
      stroke="var(--trend-income)"
      stroke-width="2.5"
    />
    <polyline
      points={points("expense")}
      fill="none"
      stroke="var(--chart-2)"
      stroke-width="2.5"
      stroke-dasharray="6 4"
    />
    {#each data as day, i}
      <circle cx={x(i)} cy={y(day.income)} r="3" fill="var(--trend-income)"
        ><title>{day.date} 收入 {money(day.income)}</title></circle
      >
      <circle cx={x(i)} cy={y(day.expense)} r="3" fill="var(--chart-2)"
        ><title>{day.date} 支出 {money(day.expense)}</title></circle
      >
      {#if i === 0 || i === data.length - 1 || i % Math.max(1, Math.ceil(data.length / 6)) === 0}<text
          x={x(i)}
          y="228"
          text-anchor="middle"
          font-size="12"
          fill="var(--muted-foreground)">{day.date.slice(5)}</text
        >{/if}
    {/each}
  </svg>
  <details class="text-sm">
    <summary class="cursor-pointer py-2 text-muted-foreground"
      >查看每日趋势明细</summary
    >
    <div class="overflow-x-auto">
      <table class="w-full text-left">
        <thead
          ><tr><th class="py-2">日期</th><th>收入</th><th>支出</th></tr></thead
        ><tbody
          >{#each data as d}<tr class="border-t"
              ><td class="py-2"
                ><a
                  class="inline-flex min-h-12 items-center text-primary underline"
                  href={dayLink(d.date)}>{d.date}</a
                ></td
              ><td class="money"
                ><a
                  class="inline-flex min-h-12 items-center"
                  href={dayLink(d.date, { account_type: "收入" })}
                  >{money(d.income)}</a
                ></td
              ><td class="money"
                ><a
                  class="inline-flex min-h-12 items-center"
                  href={dayLink(d.date, { account_type: "支出" })}
                  >{money(d.expense)}</a
                ></td
              ></tr
            >{/each}</tbody
        >
      </table>
    </div>
  </details>
</div>
