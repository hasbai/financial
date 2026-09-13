<script lang="ts">
  import { money } from "$lib/finance";
  import { cashDate, type CashBar } from "$lib/cashflow";
  let { data }: { data: CashBar[] } = $props();
  let max = $derived(
    Math.max(1, ...data.flatMap((d) => [Number(d.inflow), Number(d.outflow)])),
  );
  const height = (v: string) => (Number(v) / max) * 100;
  const tick = (ratio: number) =>
    new Intl.NumberFormat("zh-CN", {
      maximumFractionDigits: 1,
      notation: "compact",
    }).format(max * ratio);
</script>

<div class="space-y-4">
  <div
    class="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"
  >
    <span>人民币 · 每 6 天一组</span>
    <div class="flex gap-4">
      <span class="flex items-center gap-2"
        ><span class="size-2.5 rounded-sm bg-cash-in"></span>流入 · 左柱</span
      >
      <span class="flex items-center gap-2"
        ><span class="size-2.5 rounded-sm border border-cash-out bg-cash-out/65"
        ></span>流出 · 右柱</span
      >
    </div>
  </div>
  <div
    class="flex h-48 gap-2 sm:h-56"
    role="img"
    aria-label="现金流入与流出分组柱状图，每六天一组，准确金额见下方现金流明细"
  >
    <div
      class="flex w-10 shrink-0 flex-col justify-between pb-8 text-right text-xs text-muted-foreground"
      aria-hidden="true"
    >
      <span>{tick(1)}</span><span>{tick(0.5)}</span><span>0</span>
    </div>
    <div
      class="relative grid min-w-0 flex-1 gap-2"
      style:grid-template-columns={`repeat(${data.length}, minmax(0, 1fr))`}
      aria-hidden="true"
    >
      <div
        class="pointer-events-none absolute inset-x-0 top-0 bottom-8 flex flex-col justify-between"
      >
        <div class="border-t border-dashed"></div>
        <div class="border-t border-dashed"></div>
        <div class="border-t"></div>
      </div>
      {#each data as bar}
        <div class="z-10 flex min-w-0 flex-col">
          <div
            class="flex min-h-0 flex-1 items-end justify-center gap-1.5 px-1 sm:gap-3"
          >
            <div
              class="w-full max-w-7 rounded-t-md bg-cash-in"
              style:height={`${height(bar.inflow)}%`}
            ></div>
            <div
              class="w-full max-w-7 rounded-t-md border-cash-out bg-cash-out/65"
              class:border={Number(bar.outflow) > 0}
              style:height={`${height(bar.outflow)}%`}
            ></div>
          </div>
          <span
            class="flex h-8 items-end justify-center whitespace-nowrap text-[11px] text-muted-foreground sm:text-xs"
            >{cashDate(bar.start)}</span
          >
        </div>
      {/each}
    </div>
  </div>
  <details class="text-sm">
    <summary
      class="min-h-12 cursor-pointer content-center text-muted-foreground"
      >查看现金流明细</summary
    >
    <div class="overflow-x-auto">
      <table class="w-full text-left text-xs sm:text-sm">
        <caption class="pb-3 text-left text-muted-foreground"
          >北京时间；各区间含起始、不含结束。</caption
        >
        <thead
          ><tr
            ><th class="py-3">期间</th><th class="px-2">流入</th><th
              class="px-2">流出</th
            ></tr
          ></thead
        >
        <tbody
          >{#each data as bar}<tr class="border-t"
              ><td class="py-3"
                >{cashDate(bar.start, true)}<br />至 {cashDate(
                  bar.end,
                  true,
                )}</td
              ><td class="money whitespace-nowrap px-2">{money(bar.inflow)}</td
              ><td class="money whitespace-nowrap px-2">{money(bar.outflow)}</td
              ></tr
            >{/each}</tbody
        >
      </table>
    </div>
  </details>
</div>
