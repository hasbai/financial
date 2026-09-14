<script lang="ts">
  import { createQuery, useQueryClient } from "@tanstack/svelte-query";
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
  import { useReport, reportStaleTime } from "$lib/reports";
  import { router } from "$lib/router.svelte";
  import CashBars from "./CashBars.svelte";
  import Loading from "./Loading.svelte";
  import Failure from "./Failure.svelte";
  import Empty from "./Empty.svelte";
  let {
    hidden,
    asOf,
    range,
    now,
    mode = $bindable<"future" | "month">("future"),
  }: {
    hidden: boolean;
    asOf: string;
    range: CashPeriod;
    now: string;
    mode?: "future" | "month";
  } = $props();
  const api = useApi();
  const cache = useQueryClient();
  const accounts = useAccounts();
  let configured = $derived(
    !!accounts.data?.some(
      (a) => a.type === "资产" && a.subtype === "现金及等价物",
    ),
  );
  let future = $derived(nextThirtyDays(now));
  let selected = $derived(
    mode === "future" ? future : { start: range.start, end: asOf },
  );
  const futureQuery = createQuery(() => ({
    queryKey: ["overview", "cash", future.start, future.end],
    queryFn: () => api.cashflow(future.start, future.end, future.end),
    enabled: configured && mode === "future",
    staleTime: reportStaleTime,
  }));
  const monthQuery = useReport(
    "cash",
    () => ({ ...range, asOf }),
    () => configured && mode === "month",
  );
  let selectedQuery = $derived(mode === "future" ? futureQuery : monthQuery);
  let summary = $derived(selectedQuery.data);
  let empty = $derived(
    summary && Number(summary.cash_in) === 0 && Number(summary.cash_out) === 0,
  );
  const bars = createQuery(() => ({
    queryKey: ["overview", "cash-bars", selected.start, selected.end],
    queryFn: () =>
      loadCashBars(
        {
          cashflow: (start, end, asOf) =>
            cache.fetchQuery({
              queryKey: ["overview", "cash", start, end],
              queryFn: () => api.cashflow(start, end, asOf),
              staleTime: reportStaleTime,
            }),
        },
        selected,
        selected.end,
      ),
    enabled: configured && !!summary && !empty && !hidden,
    staleTime: reportStaleTime,
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
    <div
      class="flex rounded-xl bg-muted p-1"
      role="group"
      aria-label="现金流期间"
    >
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
  {:else if !configured}<Empty title="未设置现金账户"
      ><Button href="/accounts">设置账户</Button></Empty
    >
  {:else if selectedQuery.error}<Failure
      error={selectedQuery.error}
      retry={() => selectedQuery.refetch()}
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
        {:else if bars.error}<Failure
            error={bars.error}
            retry={() => bars.refetch()}
          />
        {:else if bars.isPending}<Loading />
        {:else if bars.data}<CashBars data={bars.data} />{/if}
      </div>
    </div>
  {/if}
</section>
