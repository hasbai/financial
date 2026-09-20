<script lang="ts">
  import type { Overview } from "$lib/types";
  import { dayLink } from "$lib/cashflow";
  import { money } from "$lib/finance";
  let { data }: { data: Overview["trend"] } = $props();
  let width = $state(320);
  let values = $derived(
    data.flatMap((d) => [Number(d.income), Number(d.expense)]),
  );
  let maximum = $derived(Math.max(1, ...values));
  let minimum = $derived(Math.min(0, ...values));
  const x = (i: number) =>
    46 + (i * Math.max(1, width - 62)) / Math.max(1, data.length - 1);
  const y = (value: number) =>
    16 + ((maximum - value) / (maximum - minimum)) * 156;
  const points = (key: "income" | "expense") =>
    data.map((d, i) => `${x(i)},${y(Number(d[key]))}`).join(" ");
  const tick = (value: number) =>
    new Intl.NumberFormat("zh-CN", {
      maximumFractionDigits: 1,
      notation: "compact",
    }).format(value);
  let ticks = $derived([maximum, (maximum + minimum) / 2, minimum]);
  let labelIndices = $derived.by(() => {
    const segments = Math.max(
      1,
      Math.min(data.length - 1, Math.floor((width - 62) / 64)),
    );
    return new Set(
      Array.from({ length: segments + 1 }, (_, i) =>
        Math.round((i * (data.length - 1)) / segments),
      ),
    );
  });
</script>

<div class="space-y-3" bind:clientWidth={width}>
  <div class="flex justify-between text-xs text-muted-foreground">
    <span>¥</span>
    <div class="flex gap-4">
      <span class="flex items-center gap-2"
        ><span class="h-0.5 w-5 bg-cash-in"></span>收入</span
      >
      <span class="flex items-center gap-2"
        ><span class="w-5 border-t-2 border-dashed border-cash-out"
        ></span>支出</span
      >
    </div>
  </div>
  <svg
    viewBox={`0 0 ${width || 320} 208`}
    role="img"
    aria-label="本期收入及支出趋势"
    class="h-52 w-full overflow-hidden"
  >
    {#each ticks as value}
      <line
        x1="46"
        x2={width - 16}
        y1={y(value)}
        y2={y(value)}
        stroke="var(--border)"
        stroke-dasharray="3 3"
      />
      <text
        x="38"
        y={y(value) + 4}
        text-anchor="end"
        font-size="12"
        fill="var(--muted-foreground)">{tick(value)}</text
      >
    {/each}
    {#if minimum < 0}<line
        x1="46"
        x2={width - 16}
        y1={y(0)}
        y2={y(0)}
        stroke="var(--border)"
      />{/if}
    <polyline
      points={points("income")}
      fill="none"
      stroke="var(--cash-in)"
      stroke-width="2"
      stroke-linejoin="round"
    />
    <polyline
      points={points("expense")}
      fill="none"
      stroke="var(--cash-out)"
      stroke-width="2"
      stroke-dasharray="5 4"
      stroke-linejoin="round"
    />
    {#each data as day, i}
      <circle cx={x(i)} cy={y(Number(day.income))} r="2.5" fill="var(--cash-in)"
        ><title>{day.date} 收入 {money(day.income)}</title></circle
      >
      <circle
        cx={x(i)}
        cy={y(Number(day.expense))}
        r="2.5"
        fill="var(--cash-out)"
        ><title>{day.date} 支出 {money(day.expense)}</title></circle
      >
      {#if labelIndices.has(i)}
        <text
          x={x(i)}
          y="202"
          text-anchor={i === 0
            ? "start"
            : i === data.length - 1
              ? "end"
              : "middle"}
          font-size="12"
          fill="var(--muted-foreground)"
          >{day.date.slice(5).replace("-", "/")}</text
        >
      {/if}
    {/each}
  </svg>
  <details class="text-sm">
    <summary
      class="min-h-12 cursor-pointer content-center py-3 text-muted-foreground"
      >查看每日趋势明细</summary
    >
    <div class="overflow-x-auto">
      <table class="w-full table-fixed text-left text-xs sm:text-sm">
        <thead
          ><tr><th class="w-[30%] py-2">日期</th><th>收入</th><th>支出</th></tr
          ></thead
        ><tbody
          >{#each data as d}<tr class="border-t"
              ><td class="py-2"
                ><a
                  class="inline-flex min-h-12 min-w-12 items-center text-primary underline"
                  href={dayLink(d.date)}
                  aria-label={d.date}>{d.date.slice(5).replace("-", "/")}</a
                ></td
              ><td class="money"
                ><a
                  class="inline-flex min-h-12 min-w-12 items-center break-all"
                  href={dayLink(d.date, { account_type: "收入" })}
                  >{money(d.income)}</a
                ></td
              ><td class="money"
                ><a
                  class="inline-flex min-h-12 min-w-12 items-center break-all"
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
