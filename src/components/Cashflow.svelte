<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import {
    ArrowDownLeft,
    ArrowUpRight,
    ChartNoAxesCombined,
    ChevronRight,
  } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { useApi, useAccounts } from "$lib/context";
  import { money, categoryLabels } from "$lib/finance";
  import {
    cashDate,
    loadCashBars,
    nextThirtyDays,
    type CashPeriod,
  } from "$lib/cashflow";
  import type { Overview } from "$lib/types";
  import { router } from "$lib/router.svelte";
  import CashBars from "./CashBars.svelte";
  import Loading from "./Loading.svelte";
  import Failure from "./Failure.svelte";
  import Notice from "./Notice.svelte";
  let {
    hidden,
    report,
    range,
    now,
  }: { hidden: boolean; report: Overview; range: CashPeriod; now: string } =
    $props();
  const api = useApi();
  const accounts = useAccounts();
  let mode = $state<"future" | "month">("future");
  let configured = $derived(
    !!accounts.data?.some(
      (a) => a.type === "资产" && a.subtype === "现金及等价物",
    ),
  );
  let future = $derived(nextThirtyDays(now));
  let selected = $derived(
    mode === "future" ? future : { start: range.start, end: report.as_of },
  );
  const futureQuery = createQuery(() => ({
    queryKey: ["overview", "future-cash", future.start, future.end],
    queryFn: () => api.overview(future.start, future.end, future.end),
    enabled: configured,
    staleTime: 300_000,
  }));
  let summary = $derived(mode === "future" ? futureQuery.data : report);
  let empty = $derived(
    summary && Number(summary.cash_in) === 0 && Number(summary.cash_out) === 0,
  );
  const bars = createQuery(() => ({
    queryKey: ["overview", "cash-bars", selected.start, selected.end],
    queryFn: () => loadCashBars(api, selected, selected.end),
    enabled: configured && !!summary && !empty && !hidden,
    staleTime: 300_000,
  }));
  function drilldown() {
    router.navigate(
      "/transactions?" +
        new URLSearchParams({ ...selected, posted: "true", cash: "true" }),
    );
  }
</script>

<section class="finance-card p-5 sm:p-7" aria-label="现金流量">
  <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
    <h2 class="flex items-center gap-3">
      <span class="icon-tile bg-cash-in/10 text-cash-in"
        ><ChartNoAxesCombined class="size-5" aria-hidden="true" /></span
      >现金流量
    </h2>
    <div class="flex rounded-xl bg-muted p-1" aria-label="现金流期间">
      <Button
        variant={mode === "month" ? "default" : "ghost"}
        class="rounded-lg px-3"
        aria-pressed={mode === "month"}
        onclick={() => (mode = "month")}>所选月份</Button
      >
      <Button
        variant={mode === "future" ? "default" : "ghost"}
        class="rounded-lg px-3"
        aria-pressed={mode === "future"}
        onclick={() => (mode = "future")}>未来 30 天</Button
      >
    </div>
  </div>
  {#if accounts.error}<Failure
      error={accounts.error}
      retry={() => accounts.refetch()}
    />
  {:else if accounts.isPending}<Loading />
  {:else if !configured}<Notice variant="warning"
      >未找到“资产 / 现金及等价物”科目，现金流量待确认。</Notice
    >
  {:else if mode === "future" && futureQuery.error}<Failure
      error={futureQuery.error}
      retry={() => futureQuery.refetch()}
    />
  {:else if !summary}<Loading />
  {:else}
    <div
      class="grid gap-7 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.5fr)] lg:gap-10"
    >
      <div>
        <p class="text-sm text-muted-foreground">
          {mode === "future" ? "未来 30 天净流入" : "本期净流入"}
        </p>
        <p
          class="money mt-2 break-words text-3xl font-semibold tracking-tight sm:text-4xl"
          class:text-cash-in={!hidden && !summary.cash_net.startsWith("-")}
          class:text-cash-out={!hidden && summary.cash_net.startsWith("-")}
        >
          {money(summary.cash_net, hidden)}
        </p>
        <p class="mt-3 text-xs leading-5 text-muted-foreground">
          {mode === "future" ? "已录入的未来交易" : "所选月份已记录现金流"} · {cashDate(
            selected.start,
          )}—{cashDate(selected.end)}
        </p>
        <div class="mt-6 grid grid-cols-2 gap-3 border-t pt-5">
          <div>
            <p class="flex items-center gap-1 text-sm text-muted-foreground">
              <ArrowDownLeft
                class="size-4 text-cash-in"
                aria-hidden="true"
              />流入
            </p>
            <p class="money mt-2 break-words font-semibold">
              {money(summary.cash_in, hidden)}
            </p>
          </div>
          <div>
            <p class="flex items-center gap-1 text-sm text-muted-foreground">
              <ArrowUpRight
                class="size-4 text-cash-out"
                aria-hidden="true"
              />流出
            </p>
            <p class="money mt-2 break-words font-semibold">
              {money(summary.cash_out, hidden)}
            </p>
          </div>
        </div>
        <Button
          variant="link"
          class="mt-4 px-0 text-muted-foreground"
          onclick={drilldown}
          >查看流水<ChevronRight aria-hidden="true" /></Button
        >
      </div>
      <div class="min-w-0">
        {#if hidden}<div
            class="grid min-h-52 place-items-center rounded-xl bg-muted/50 text-sm text-muted-foreground"
          >
            现金流金额已隐藏
          </div>
        {:else if empty}<div
            class="flex min-h-52 flex-col items-center justify-center gap-2 rounded-xl bg-muted/50 px-5 text-center"
          >
            <ChartNoAxesCombined
              class="mb-2 size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <p class="font-medium">
              {mode === "future"
                ? "未来 30 天暂无已记录现金流量"
                : "本期暂无已记录现金流量"}
            </p>
            <p class="text-sm text-muted-foreground">
              完整交易产生现金变动后，将在这里显示。
            </p>
          </div>
        {:else if bars.error}<Failure
            error={bars.error}
            retry={() => bars.refetch()}
          />
        {:else if bars.isPending}<Loading />
        {:else if bars.data}<CashBars data={bars.data} />{/if}
      </div>
    </div>
    {#if summary.cash_categories.length}<div
        class="mt-5 grid gap-3 border-t pt-5 sm:grid-cols-3"
      >
        {#each summary.cash_categories as category}<div
            class="rounded-xl bg-muted/50 p-3 text-xs"
          >
            <p class="mb-2 font-medium">{categoryLabels[category.name]}</p>
            <p class="leading-6 text-muted-foreground">
              流入 {money(category.inflow, hidden)}<br />流出 {money(
                category.outflow,
                hidden,
              )}
            </p>
          </div>{/each}
      </div>{/if}
    <p class="mt-5 text-xs leading-5 text-muted-foreground">
      {mode === "future"
        ? "自页面打开时起 30 天，仅汇总已录入且完整的成功／退款交易，不含待处理记录。"
        : "统计至所选月份末或页面打开时点，以较早者为准。"}现金内部转账抵销，同笔退款冲减原支出。
    </p>
    {#if summary.quality.period_pending > 0}<p
        class="mt-2 text-xs text-muted-foreground"
      >
        期间另有 {summary.quality.period_pending} 笔待补录，尚未纳入。
      </p>{/if}
  {/if}
</section>
