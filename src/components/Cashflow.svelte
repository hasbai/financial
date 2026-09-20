<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import {
    ArrowDownLeft,
    ArrowUpRight,
    ChartNoAxesCombined,
    ChevronRight,
    EyeOff,
  } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { useApi, useAccounts } from "$lib/context";
  import { money } from "$lib/finance";
  import { loadCashBars, nextThirtyDays, type CashPeriod } from "$lib/cashflow";
  import type { HomeSnapshot } from "$lib/types";
  import { useReport } from "$lib/reports";
  import { sessionQueryOptions } from "$lib/query-cache";
  import { router } from "$lib/router.svelte";
  import CashBars from "./CashBars.svelte";
  import Loading from "./Loading.svelte";
  import Failure from "./Failure.svelte";
  import Empty from "./Empty.svelte";
  let {
    hidden,
    snapshot,
    asOf,
    range,
    now,
    mode = $bindable<"future" | "month">("month"),
    daily = false,
    onShowDaily,
  }: {
    hidden: boolean;
    snapshot?: HomeSnapshot;
    asOf: string;
    range: CashPeriod;
    now: string;
    mode?: "future" | "month";
    daily?: boolean;
    onShowDaily?: () => void;
  } = $props();
  const api = useApi();
  const accounts = useAccounts(() => !snapshot);
  let configured = $derived(
    snapshot?.cash_configured ??
      !!accounts.data?.some(
        (a) => a.type === "资产" && a.subtype === "现金及等价物",
      ),
  );
  let future = $derived(
    snapshot
      ? { start: snapshot.as_of, end: snapshot.future_end }
      : nextThirtyDays(now),
  );
  let selected = $derived(
    mode === "future" ? future : { start: range.start, end: asOf },
  );
  const futureQuery = createQuery(() => ({
    queryKey: ["overview", "cash", future.start, future.end],
    queryFn: () => api.cashflow(future.start, future.end, future.end),
    enabled: !snapshot && configured && mode === "future",
    ...sessionQueryOptions,
  }));
  let monthSnapshot = $derived(
    snapshot && Date.parse(snapshot.start) === Date.parse(range.start)
      ? snapshot.month_cash
      : undefined,
  );
  const monthQuery = useReport(
    "cash",
    () => ({ ...range, asOf }),
    () => configured && mode === "month" && !monthSnapshot,
  );
  let selectedQuery = $derived(mode === "future" ? futureQuery : monthQuery);
  let summary = $derived(
    mode === "future" && snapshot
      ? snapshot.cash
      : mode === "month" && monthSnapshot
        ? monthSnapshot
        : selectedQuery.data,
  );
  let suppliedBars = $derived(
    mode === "future"
      ? snapshot?.cash_bars
      : monthSnapshot
        ? snapshot?.month_cash_bars
        : undefined,
  );
  let empty = $derived(
    summary && Number(summary.cash_in) === 0 && Number(summary.cash_out) === 0,
  );
  const bars = createQuery(() => ({
    queryKey: ["overview", "cash-bars", selected.start, selected.end],
    queryFn: () => loadCashBars(api, selected, selected.end),
    enabled:
      !(mode === "future" && snapshot) &&
      !suppliedBars &&
      configured &&
      !!summary &&
      !empty &&
      !hidden,
    ...sessionQueryOptions,
  }));
  function drilldown() {
    router.navigate(
      "/transactions?" +
        new URLSearchParams({ ...selected, posted: "true", cash: "true" }),
    );
  }
</script>

<section class="finance-card cashflow-card p-5 sm:p-7" aria-label="现金流量">
  <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
    <h2 class="flex items-center gap-3">
      <span class="icon-tile bg-cash-in/10 text-cash-in"
        ><ChartNoAxesCombined class="size-5" aria-hidden="true" /></span
      >现金流量
    </h2>
    {#if onShowDaily}<Button
        variant="ghost"
        size="icon"
        aria-label="查看每日现金流"
        onclick={onShowDaily}><ChevronRight aria-hidden="true" /></Button
      >{/if}
    <div
      class="flex w-full rounded-xl bg-muted p-1 sm:w-auto"
      role="group"
      aria-label="现金流期间"
    >
      <Button
        variant={mode === "month" ? "default" : "ghost"}
        class="flex-1 rounded-lg px-3"
        aria-pressed={mode === "month"}
        onclick={() => (mode = "month")}>所选月份</Button
      >
      <Button
        variant={mode === "future" ? "default" : "ghost"}
        class="flex-1 rounded-lg px-3"
        aria-pressed={mode === "future"}
        onclick={() => (mode = "future")}>未来 30 天</Button
      >
    </div>
  </div>
  {#if !snapshot && accounts.error}<Failure
      error={accounts.error}
      retry={() => accounts.refetch()}
    />
  {:else if !snapshot && accounts.isPending}<Loading />
  {:else if !configured}<Empty title="未设置现金账户"
      ><Button href="/accounts">设置账户</Button></Empty
    >
  {:else if !(mode === "future" && snapshot) && !monthSnapshot && selectedQuery.error}<Failure
      error={selectedQuery.error}
      retry={() => selectedQuery.refetch()}
    />
  {:else if !summary}<Loading />
  {:else}
    <div
      class="grid gap-5 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.5fr)] lg:gap-10"
    >
      <div>
        <div
          class="cashflow-total-heading flex items-center justify-between gap-2"
        >
          <p class="text-sm text-muted-foreground">
            {mode === "future" ? "未来 30 天净流入" : "本期净流入"}
          </p>
          <Button
            variant="link"
            class="cashflow-inline-link px-0 text-muted-foreground"
            onclick={drilldown}
            >查看流水<ChevronRight aria-hidden="true" /></Button
          >
        </div>
        <p
          class="money mt-2 break-words text-3xl font-semibold tracking-tight sm:text-4xl"
          class:text-cash-in={!hidden && !summary.cash_net.startsWith("-")}
          class:text-cash-out={!hidden && summary.cash_net.startsWith("-")}
        >
          {money(summary.cash_net, hidden)}
        </p>
        <div class="mt-4 grid grid-cols-2 gap-3 border-t pt-4">
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
      </div>
      <div class="min-w-0">
        {#if hidden}<div
            class="grid min-h-52 place-items-center rounded-xl bg-muted/50 text-sm text-muted-foreground"
          >
            <EyeOff class="size-8" aria-label="金额已隐藏" />
          </div>
        {:else if empty}<div
            class="flex min-h-52 flex-col items-center justify-center gap-2 rounded-xl bg-muted/50 px-5 text-center"
          >
            <ChartNoAxesCombined
              class="mb-2 size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <p class="font-medium">暂无现金流</p>
            <Button href="/transactions/new" variant="outline">记一笔</Button>
          </div>
        {:else if suppliedBars}<CashBars data={suppliedBars} {daily} />
        {:else if bars.error}<Failure
            error={bars.error}
            retry={() => bars.refetch()}
          />
        {:else if bars.isPending}<Loading />
        {:else if bars.data}<CashBars data={bars.data} {daily} />{/if}
      </div>
    </div>
  {/if}
</section>
