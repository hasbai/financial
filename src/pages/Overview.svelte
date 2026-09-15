<script lang="ts">
  import { useReport, useReportTime } from "$lib/reports";
  import { sessionQueryOptions } from "$lib/query-cache";
  import { effectiveEnd } from "$lib/api";
  import { untrack } from "svelte";
  import { createQuery, useQueryClient } from "@tanstack/svelte-query";
  import {
    Bell,
    Search,
    ChevronRight,
    Database,
    Landmark,
    TrendingUp,
    Wallet,
    Eye,
    EyeOff,
  } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { useApi } from "$lib/context";
  import { currentMonth, money, monthRange } from "$lib/finance";
  import { router } from "$lib/router.svelte";
  import Field from "../components/Field.svelte";
  import Loading from "../components/Loading.svelte";
  import Failure from "../components/Failure.svelte";
  import Empty from "../components/Empty.svelte";
  import Trend from "../components/Trend.svelte";
  import Cashflow from "../components/Cashflow.svelte";
  import BalanceSparkline from "../components/BalanceSparkline.svelte";
  let {
    hidden,
    onToggleAmounts,
  }: { hidden: boolean; onToggleAmounts?: () => void } = $props();
  let localHidden = $state(false);
  let masked = $derived(hidden || localHidden);
  let params = $derived(new URLSearchParams(router.location.search));
  let month = $derived.by(() => {
    const value = params.get("month") ?? "";
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value <= currentMonth()
      ? value
      : currentMonth();
  });
  let view = $derived(
    ["assets", "cash", "profit"].includes(params.get("view") ?? "")
      ? params.get("view")!
      : "overview",
  );
  let balanceType = $derived(
    ["资产", "负债"].includes(params.get("type") ?? "")
      ? params.get("type")!
      : "",
  );
  function showView(next: string, type = "", selectedMonth = month) {
    const search = new URLSearchParams();
    if (next !== "overview") search.set("view", next);
    if (next === "assets" && type) search.set("type", type);
    if (selectedMonth !== currentMonth()) search.set("month", selectedMonth);
    router.navigate("/" + (search.size ? "?" + search : ""));
  }
  let cashMode = $state<"future" | "month">("month");
  const api = useApi();
  const openedAt = useReportTime();
  const cache = useQueryClient();
  let charts = $state(!untrack(() => hidden));
  $effect(() => {
    if (!masked) charts = true;
  });
  const home = createQuery(() => ({
    queryKey: ["overview", "home", charts],
    queryFn: async () => {
      const snapshot = await api.home(charts);
      cache.setQueryData(["overview", "snapshot"], snapshot.as_of);
      cache.setQueryData(
        ["overview", "income", snapshot.start, snapshot.as_of],
        {
          income: snapshot.income,
          expense: snapshot.expense,
          profit: snapshot.profit,
        },
      );
      return snapshot;
    },
    ...sessionQueryOptions,
  }));
  let now = $derived(home.data?.as_of ?? openedAt);
  let current = $derived(month === currentMonth());
  let range = $derived(monthRange(month));
  let cutoff = $derived(effectiveEnd(range.end, now));
  const period = () => ({ ...range, asOf: now });
  const balance = useReport(
    "balance",
    period,
    () => !current && !!home.data && (view === "overview" || view === "assets"),
  );
  const income = useReport(
    "income",
    period,
    () => !current && !!home.data && (view === "overview" || view === "profit"),
  );
  const quality = useReport("quality", period, () => !current && !!home.data);
  const balances = useReport("accounts", period, () => view === "assets");
  const categories = useReport("categories", period, () => view === "profit");
  const trend = useReport("trend", period, () => view === "profit" && !masked);
  let active = $derived([
    home,
    ...(!current ? [quality] : []),
    ...(!current && (view === "overview" || view === "assets")
      ? [balance]
      : []),
    ...(!current && (view === "overview" || view === "profit") ? [income] : []),
    ...(view === "assets" ? [balances] : []),
    ...(view === "profit" ? [categories, ...(!masked ? [trend] : [])] : []),
  ]);
  let query = $derived({
    isPending: !active.some((q) => q.error) && active.some((q) => q.isPending),
    error: active.find((q) => q.error)?.error,
    refetch: () =>
      Promise.all(active.filter((q) => q.isError).map((q) => q.refetch())),
  });
  let data = $derived({
    as_of: cutoff,
    net_assets:
      (current ? home.data?.net_assets : balance.data?.net_assets) ?? "0",
    assets: (current ? home.data?.assets : balance.data?.assets) ?? "0",
    liabilities:
      (current ? home.data?.liabilities : balance.data?.liabilities) ?? "0",
    income: (current ? home.data?.income : income.data?.income) ?? "0",
    expense: (current ? home.data?.expense : income.data?.expense) ?? "0",
    profit: (current ? home.data?.profit : income.data?.profit) ?? "0",
    quality: {
      pending: (current ? home.data?.pending : quality.data?.pending) ?? 0,
    },
    accounts: balances.data ?? [],
    categories: categories.data ?? [],
    trend: trend.data ?? [],
  });
  function down(filters: Record<string, string>) {
    router.navigate(
      "/transactions?" +
        new URLSearchParams({
          start: range.start,
          end: data?.as_of ?? range.end,
          posted: "true",
          ...filters,
        }),
    );
  }
  function toggleAmounts() {
    if (onToggleAmounts) onToggleAmounts();
    else localHidden = !localHidden;
  }
</script>

<div class="page">
  <div class="page-heading pr-12">
    <h1>个人财务</h1>
    <div class="flex items-center gap-1">
      <Button
        href="/transactions"
        variant="ghost"
        size="icon"
        aria-label="搜索流水"
        ><Search class="size-6" aria-hidden="true" /></Button
      >
      <Button
        href="/transactions?review=needed"
        variant="ghost"
        size="icon"
        class="relative"
        aria-label={home.data ? `待补录 ${data.quality.pending} 笔` : "待补录"}
        ><Bell
          class="size-6"
          aria-hidden="true"
        />{#if data && data.quality.pending > 0}<span
            class="absolute top-1 right-1 size-2 rounded-full bg-cash-out"
            aria-hidden="true"
          ></span>{/if}</Button
      >
    </div>
  </div>
  <div class="flex items-center justify-between gap-3">
    <div
      class="flex min-w-0 flex-1 rounded-full bg-card/80 p-1"
      role="group"
      aria-label="报表视图"
    >
      {#each [["overview", "总览"], ["assets", "资产负债"], ["cash", "现金流量"], ["profit", "损益"]] as [key, label]}<Button
          class="min-w-0 flex-1 rounded-full px-2"
          variant={view === key ? "default" : "ghost"}
          aria-pressed={view === key}
          onclick={() => showView(key)}>{label}</Button
        >{/each}
    </div>
    <div class="hidden max-w-40 sm:block">
      <Field
        label="报表月份"
        type="month"
        compact
        max={currentMonth()}
        value={month}
        onchange={(e) => {
          if (
            /^\d{4}-\d{2}$/.test(e.currentTarget.value) &&
            e.currentTarget.value <= currentMonth()
          )
            showView(view, balanceType, e.currentTarget.value);
        }}
      />
    </div>
  </div>
  {#if view === "assets"}
    <div class="flex gap-2" role="group" aria-label="资产负债类型">
      {#each ["", "资产", "负债"] as type}
        <Button
          variant={balanceType === type ? "default" : "outline"}
          aria-pressed={balanceType === type}
          onclick={() => showView("assets", type)}>{type || "全部"}</Button
        >
      {/each}
    </div>
  {/if}
  {#if query.isPending}<Loading />{:else if query.error}<Failure
      error={query.error}
      retry={() => query.refetch()}
    />{:else if data}
    <div class="flex justify-end sm:hidden">
      <Field
        label="报表月份"
        type="month"
        compact
        max={currentMonth()}
        value={month}
        onchange={(e) => {
          if (
            /^\d{4}-\d{2}$/.test(e.currentTarget.value) &&
            e.currentTarget.value <= currentMonth()
          )
            showView(view, balanceType, e.currentTarget.value);
        }}
      />
    </div>
    {#if view === "overview"}
      <section
        class="finance-card relative overflow-hidden p-5 sm:p-7"
        aria-label="净资产"
      >
        {#if !masked}<div
            class="pointer-events-none absolute right-0 bottom-0 w-1/2 opacity-65"
          >
            <BalanceSparkline
              start={range.start}
              end={data.as_of}
              closing={data.net_assets}
              values={current ? (home.data?.balance_trend ?? []) : undefined}
            />
          </div>{/if}
        <div class="relative">
          <div class="flex items-center gap-3">
            <span class="icon-tile bg-asset/10 text-asset"
              ><Database class="size-5" aria-hidden="true" /></span
            >
            <h2>净资产</h2>
            <Button
              variant="ghost"
              size="icon"
              aria-label={masked ? "显示金额" : "隐藏金额"}
              onclick={toggleAmounts}
              >{#if masked}<EyeOff aria-hidden="true" />{:else}<Eye
                  aria-hidden="true"
                />{/if}</Button
            >
          </div>
          <p class="money mt-4 break-words text-4xl font-semibold sm:text-5xl">
            {money(data.net_assets, masked)}
          </p>
        </div>
      </section>
      <div class="grid grid-cols-2 gap-3 sm:gap-4">
        {#each [{ type: "资产", title: "总资产", value: data.assets, icon: Wallet, color: "bg-asset/10 text-asset" }, { type: "负债", title: "总负债", value: data.liabilities, icon: Landmark, color: "bg-cash-out/10 text-cash-out" }] as item}
          <button
            class="finance-card min-w-0 p-4 text-left transition-colors hover:bg-accent sm:p-5"
            onclick={() => showView("assets", item.type)}
            ><span class="flex items-center gap-2"
              ><span class={`icon-tile ${item.color}`}
                ><item.icon class="size-5" aria-hidden="true" /></span
              ><span class="font-medium">{item.title}</span><ChevronRight
                class="ml-auto size-4 text-muted-foreground"
                aria-hidden="true"
              /></span
            ><span
              class="money mt-3 block break-words text-xl font-semibold sm:text-2xl"
              >{money(item.value, masked)}</span
            ></button
          >
        {/each}
      </div>
    {/if}
    {#if view === "overview"}<Button
        variant="ghost"
        onclick={() => showView("cash")}
        >查看每日现金流<ChevronRight aria-hidden="true" /></Button
      >{/if}
    {#if view === "overview" || view === "cash"}<Cashflow
        hidden={masked}
        daily={view === "cash"}
        snapshot={home.data}
        asOf={data.as_of}
        bind:mode={cashMode}
        {range}
        {now}
      />{/if}
    {#if view === "overview" || view === "profit"}
      <section class="finance-card p-5 sm:p-6" aria-label="本期损益">
        <div class="mb-5 flex items-center justify-between">
          <h2 class="flex items-center gap-3">
            <span class="icon-tile bg-profit/10 text-profit"
              ><TrendingUp class="size-5" aria-hidden="true" /></span
            >损益
          </h2>
          {#if view === "overview"}<Button
              variant="ghost"
              size="icon"
              aria-label="查看损益明细"
              onclick={() => showView("profit")}
              ><ChevronRight aria-hidden="true" /></Button
            >{/if}
        </div>
        <div class="grid grid-cols-3 divide-x">
          <div class="min-w-0 pr-3">
            <p class="text-sm text-muted-foreground">本月收入</p>
            <button
              class="money mt-1 min-h-12 break-words text-left font-semibold sm:text-2xl"
              onclick={() => down({ account_type: "收入" })}
              >{money(data.income, masked)}</button
            >
          </div>
          <div class="min-w-0 px-3">
            <p class="text-sm text-muted-foreground">本月支出</p>
            <button
              class="money mt-1 min-h-12 break-words text-left font-semibold sm:text-2xl"
              onclick={() => down({ account_type: "支出" })}
              >{money(data.expense, masked)}</button
            >
          </div>
          <div class="min-w-0 pl-3">
            <p class="text-sm text-muted-foreground">本月利润</p>
            <p
              class="money mt-1 min-h-12 content-center break-words font-semibold sm:text-2xl"
            >
              {money(data.profit, masked)}
            </p>
          </div>
        </div>
      </section>
    {/if}
    {#if view === "profit"}<section
        class="finance-card space-y-4 p-5"
        aria-label="损益明细"
      >
        {#if masked}<div class="grid h-40 place-items-center">
            <EyeOff
              class="size-8 text-muted-foreground"
              aria-label="金额已隐藏"
            />
          </div>{:else if data.trend.length}<Trend
            data={data.trend}
          />{:else}<Empty
            title="暂无收支"
          />{/if}{#each data.categories as c}<button
            class="flex min-h-12 w-full justify-between gap-3 border-t py-3 text-left"
            onclick={() => down({ account_type: c.type })}
            ><span>{c.type} · {c.name}</span><span class="money"
              >{money(c.amount, masked)}</span
            ></button
          >{/each}
      </section>{/if}
    {#if view === "assets"}<section
        class="finance-card divide-y p-5"
        aria-label="科目余额"
      >
        <div class="flex items-center justify-between gap-3 pb-4">
          <h2>{balanceType ? `总${balanceType}` : "资产负债"}</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label={masked ? "显示金额" : "隐藏金额"}
            onclick={toggleAmounts}
          >
            {#if masked}<EyeOff aria-hidden="true" />{:else}<Eye
                aria-hidden="true"
              />{/if}
          </Button>
        </div>
        <div class="grid gap-3 py-4" class:grid-cols-2={!balanceType}>
          {#each [{ type: "资产", value: data.assets }, { type: "负债", value: data.liabilities }].filter((item) => !balanceType || item.type === balanceType) as item}
            <div class="min-w-0">
              {#if !balanceType}<p class="text-sm text-muted-foreground">
                  总{item.type}
                </p>{/if}
              <p class="money break-words text-2xl font-semibold">
                {money(item.value, masked)}
              </p>
            </div>
          {/each}
        </div>
        {#each data.accounts.filter((a) => ["资产", "负债"].includes(a.type) && (!balanceType || a.type === balanceType)) as a}<button
            class="flex min-h-16 w-full items-center justify-between gap-3 py-3 text-left"
            onclick={() =>
              down({
                account_id: String(a.id),
                start: "",
                end: current ? "" : data.as_of,
                posted: "",
                matched: "true",
              })}
            ><span
              ><span class="block font-medium">{a.name}</span><span
                class="text-sm text-muted-foreground"
                >{a.type} · {a.subtype}</span
              ></span
            ><span class="money">{money(a.balance, masked)}</span></button
          >{:else}<Empty title="暂无余额"
            ><Button href="/transactions/new">记一笔</Button></Empty
          >{/each}
      </section>{/if}
  {/if}
</div>
