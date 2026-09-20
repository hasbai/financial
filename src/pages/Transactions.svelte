<script lang="ts">
  import { keepFocusVisible } from "$lib/keep-focus-visible";
  import { useReport, useReportTime } from "$lib/reports";
  import { effectiveEnd } from "$lib/api";
  import { createInfiniteQuery } from "@tanstack/svelte-query";
  import { SlidersHorizontal, Search, ChevronRight, X } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import { MediaQuery } from "svelte/reactivity";
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Card from "$lib/components/ui/card";
  import { useApi, useAccounts } from "$lib/context";
  import { router } from "$lib/router.svelte";
  import {
    money,
    statusLabels,
    kindLabels,
    currentMonth,
    monthRange,
    localDateTime,
  } from "$lib/finance";
  import type { Cursor } from "$lib/types";
  import Field from "../components/Field.svelte";
  import SelectField from "../components/SelectField.svelte";
  import AccountPicker from "../components/AccountPicker.svelte";
  import Loading from "../components/Loading.svelte";
  import Failure from "../components/Failure.svelte";
  import Empty from "../components/Empty.svelte";
  import TransactionIcon from "../components/TransactionIcon.svelte";
  import MiniBars from "../components/MiniBars.svelte";
  import { transactionMoney, transactionCategory } from "$lib/presentation";
  let { hidden }: { hidden: boolean } = $props();
  const api = useApi();
  let visible = $derived(router.location.pathname === "/transactions");
  const accounts = useAccounts(() => visible);
  let expanded = $state(false);
  const desktop = new MediaQuery("(min-width: 640px)");
  const filterTriggerId = $props.id();
  let search = $state("");
  let params = $derived(new URLSearchParams(router.location.search));
  let filterKey = $derived(params.toString());
  let filters = $derived(Object.fromEntries(params));
  $effect(() => {
    search = new URLSearchParams(filterKey).get("search") || "";
  });
  const now = useReportTime();
  let summaryMonth = $derived(
    params.get("start") && Number.isFinite(Date.parse(params.get("start")!))
      ? new Date(params.get("start")!).toLocaleDateString("sv-SE", {
          timeZone: "Asia/Shanghai",
          year: "numeric",
          month: "2-digit",
        })
      : currentMonth(),
  );
  let summaryRange = $derived(monthRange(summaryMonth));
  const period = () => ({ ...summaryRange, asOf: now });
  const income = useReport("income", period, () => visible);
  const cash = useReport("cash", period, () => visible);
  const trend = useReport("trend", period, () => visible && !hidden);
  let activeSummary = $derived([income, cash, ...(!hidden ? [trend] : [])]);
  let summary = $derived({
    isPending: activeSummary.some((q) => q.isPending),
    error: activeSummary.find((q) => q.error)?.error,
    refetch: () =>
      Promise.all(
        activeSummary.filter((q) => q.isError).map((q) => q.refetch()),
      ),
    data: {
      as_of: effectiveEnd(summaryRange.end, now),
      income: income.data?.income ?? "0",
      expense: income.data?.expense ?? "0",
      cash_net: cash.data?.cash_net ?? "0",
      trend: trend.data ?? [],
    },
  });
  function setMonth(month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    const next = new URLSearchParams(params);
    const range = monthRange(month);
    next.set("start", range.start);
    next.set("end", range.end);
    router.navigate("/transactions?" + next, true);
  }
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.navigate(
      router.location.pathname + (next.size ? "?" + next : ""),
      true,
    );
  }
  function clear() {
    router.navigate("/transactions", true);
  }
  const query = createInfiniteQuery(() => ({
    queryKey: ["transactions", filterKey],
    queryFn: ({ pageParam }) => api.list(filters, pageParam),
    enabled: visible,
    initialPageParam: null as Cursor,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  }));
  let items = $derived(query.data?.pages.flatMap((p) => p.items) || []);
  $effect(() => {
    const key = "financial.scroll." + filterKey;
    const path = router.location.pathname;
    if (path !== "/transactions" || query.isPending) return;
    const savedY = sessionStorage.getItem(key);
    const frame = requestAnimationFrame(() =>
      window.scrollTo(0, Number(savedY ?? 0)),
    );
    const remember = () => sessionStorage.setItem(key, String(window.scrollY));
    window.addEventListener("scroll", remember, { passive: true });
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", remember);
    };
  });
  const date = (value: string) =>
    new Date(value).toLocaleDateString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  const statuses = [
    { value: "", label: "全部" },
    ...Object.entries(statusLabels).map(([value, label]) => ({ value, label })),
  ];
  const channels = ["", "direct", "支付宝", "微信", "云闪付", "Apple"].map(
    (value) => ({
      value,
      label: value === "direct" ? "直接交易" : value || "全部",
    }),
  );
  const filterDate = (value: string | null, end = false) => {
    if (!value || !Number.isFinite(Date.parse(value))) return "";
    return localDateTime(
      new Date(Date.parse(value) - (end ? 1 : 0)).toISOString(),
    ).slice(0, 10);
  };
  let extraFilters = $derived.by(() => {
    const selected: { keys: string[]; label: string }[] = [];
    const start = filterDate(params.get("start"));
    const end = filterDate(params.get("end"), true);
    if (start || end)
      selected.push({
        keys: ["start", "end"],
        label: start === end ? start : `${start || "不限"} 至 ${end || "不限"}`,
      });
    const accountId = params.get("account_id");
    if (accountId)
      selected.push({
        keys: ["account_id"],
        label:
          accounts.data?.find((a) => String(a.id) === accountId)?.name ??
          `科目 ${accountId}`,
      });
    for (const [key, label] of [
      ["status", statusLabels[params.get("status") || ""]],
      [
        "payment_method",
        channels.find((c) => c.value === params.get("payment_method"))?.label,
      ],
      ["posted", "已入账"],
      ["cash", "现金"],
      ["matched", "科目已匹配"],
      ["search", params.get("search")],
    ]) {
      if (key && params.get(key) && label)
        selected.push({ keys: [key], label });
    }
    return selected;
  });
</script>

<div class="page">
  <div class="page-heading pr-12">
    <h1>交易流水</h1>
    <div class="max-w-40">
      <Field
        label="流水月份"
        type="month"
        compact
        value={params.get("start") ? summaryMonth : ""}
        onchange={(e) => setMonth(e.currentTarget.value)}
      />
    </div>
  </div>
  {#if summary.isPending}<Loading />{:else if summary.error}<Failure
      error={summary.error}
      retry={() => summary.refetch()}
    />{:else if summary.data}
    <section
      class="summary-metrics finance-card grid grid-cols-3 divide-x p-4 sm:p-6"
      aria-label="月度收支"
    >
      {#each [{ label: "收入", value: summary.data.income, type: "收入" }, { label: "支出", value: summary.data.expense, type: "支出" }, { label: "净流入", value: summary.data.cash_net, type: "cash" }] as stat}<button
          class="flex min-w-0 flex-col items-start px-2 text-left first:pl-0 last:pr-0"
          onclick={() =>
            router.navigate(
              "/transactions?" +
                new URLSearchParams({
                  start: summaryRange.start,
                  end: summary.data!.as_of,
                  posted: "true",
                  ...(stat.type === "cash"
                    ? { cash: "true" }
                    : { account_type: stat.type }),
                }),
            )}
          ><span class="block text-sm text-muted-foreground"
            >{Number(summaryMonth.slice(5))}月{stat.label}</span
          ><span class="money mt-3 block break-words font-semibold sm:text-2xl"
            >{money(stat.value, hidden)}</span
          >{#if stat.type === "cash" && !hidden && summary.data.trend.length}<span
              class="mini-trend mt-2 block w-full overflow-hidden"
              ><MiniBars data={summary.data.trend} /></span
            >{/if}</button
        >{/each}
    </section>
  {/if}
  <form
    class="flex items-center gap-2"
    onsubmit={(e) => {
      e.preventDefault();
      update("search", search);
    }}
  >
    <div
      class="finance-card flex min-w-0 flex-1 items-center gap-1 rounded-full px-3"
    >
      <Search
        class="size-5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      /><Field
        label="搜索商户或摘要"
        placeholder="搜索商家、备注"
        type="search"
        compact
        bind:value={search}
      /><Button type="submit" variant="ghost" size="icon" aria-label="搜索"
        ><ChevronRight aria-hidden="true" /></Button
      >
    </div>
    <Button
      variant="ghost"
      size="icon"
      id={filterTriggerId}
      aria-label="展开筛选"
      aria-haspopup={desktop.current ? undefined : "dialog"}
      class="relative"
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
      ><SlidersHorizontal aria-hidden="true" />{#if extraFilters.length}<span
          class="absolute top-0 right-0 grid min-w-4 h-4 place-items-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground"
          >{extraFilters.length}</span
        >{/if}</Button
    >
  </form>
  <div class="flex flex-wrap gap-2" role="group" aria-label="流水筛选">
    {#each [["", "全部"], ["支出", "支出"], ["收入", "收入"]] as [v, label]}<Button
        variant={(params.get("account_type") || "") === v &&
        !params.get("review")
          ? "default"
          : "secondary"}
        aria-pressed={(params.get("account_type") || "") === v &&
          !params.get("review")}
        onclick={() => {
          const next = new URLSearchParams(params);
          next.delete("review");
          if (v) next.set("account_type", v);
          else next.delete("account_type");
          router.navigate("/transactions?" + next, true);
        }}>{label}</Button
      >{/each}
    {#each [["needed", "待补录"], ["unmatched", "待匹配"]] as [v, label]}<Button
        variant={params.get("review") === v ? "default" : "secondary"}
        aria-pressed={params.get("review") === v}
        onclick={() => update("review", params.get("review") === v ? "" : v)}
        >{label}</Button
      >{/each}
  </div>
  {#if extraFilters.length}<div
      class="flex flex-wrap gap-2"
      role="group"
      aria-label="已选筛选"
    >
      {#each extraFilters as filter}
        <Button
          variant="outline"
          class="h-auto min-h-12 max-w-full whitespace-normal text-left"
          aria-label={`清除筛选：${filter.label}`}
          onclick={() => {
            const next = new URLSearchParams(params);
            filter.keys.forEach((key) => next.delete(key));
            router.navigate(
              "/transactions" + (next.size ? "?" + next : ""),
              true,
            );
          }}
          ><span class="min-w-0 break-words">{filter.label}</span><X
            class="shrink-0"
            aria-hidden="true"
          /></Button
        >
      {/each}
      <Button variant="ghost" onclick={clear}>清空筛选</Button>
    </div>{/if}
  {#snippet filterFields()}
    <div class="grid gap-4 sm:grid-cols-2">
      <Field
        label="起始日期"
        type="date"
        value={params.get("start") &&
        Number.isFinite(Date.parse(params.get("start")!))
          ? localDateTime(params.get("start")!).slice(0, 10)
          : ""}
        onchange={(e) =>
          update(
            "start",
            e.currentTarget.value
              ? e.currentTarget.value + "T00:00:00+08:00"
              : "",
          )}
      /><Field
        label="结束日期"
        type="date"
        value={params.get("end") &&
        Number.isFinite(Date.parse(params.get("end")!))
          ? localDateTime(
              new Date(Date.parse(params.get("end")!) - 1).toISOString(),
            ).slice(0, 10)
          : ""}
        onchange={(e) =>
          update(
            "end",
            e.currentTarget.value
              ? new Date(
                  Date.parse(e.currentTarget.value + "T00:00:00+08:00") +
                    86400000,
                ).toISOString()
              : "",
          )}
      />
    </div>
    {#if accounts.error}<Failure
        error={accounts.error}
        retry={() => accounts.refetch()}
      />{:else}<AccountPicker
        label="科目"
        accounts={accounts.data || []}
        value={params.has("account_id")
          ? Number(params.get("account_id"))
          : null}
        onChange={(id) => update("account_id", id ? String(id) : "")}
      />{/if}
    <div class="grid gap-4 sm:grid-cols-2">
      <SelectField
        label="交易状态"
        value={params.get("status") || ""}
        options={statuses}
        onchange={(v) => update("status", v)}
      /><SelectField
        label="支付渠道"
        value={params.get("payment_method") || ""}
        options={channels}
        onchange={(v) => update("payment_method", v)}
      />
    </div>
  {/snippet}
  {#if desktop.current}
    {#if expanded}<Card.Root
        ><Card.Content class="space-y-4 p-5">
          {@render filterFields()}
          <Button variant="ghost" onclick={clear}>清空全部筛选</Button>
        </Card.Content></Card.Root
      >{/if}
  {:else}
    <Dialog.Root bind:open={expanded}>
      <Dialog.Content
        showCloseButton={false}
        class="form-sheet"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document
            .getElementById(filterTriggerId)
            ?.focus({ preventScroll: true });
        }}
      >
        <Dialog.Header
          class="form-sheet-header flex-row items-center justify-between text-left"
        >
          <Dialog.Title>筛选流水</Dialog.Title><Dialog.Description
            class="sr-only">流水筛选</Dialog.Description
          >
          <Button
            variant="ghost"
            size="icon"
            aria-label="关闭筛选"
            onclick={() => (expanded = false)}><X aria-hidden="true" /></Button
          >
        </Dialog.Header>
        <div class="form-sheet-body space-y-4" use:keepFocusVisible>
          {@render filterFields()}
        </div>
        <div class="form-sheet-footer">
          <Button variant="outline" onclick={clear}>清空全部筛选</Button>
          <Button onclick={() => (expanded = false)}>完成</Button>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  {/if}
  {#if query.isPending}<Loading />{:else if query.error}<Failure
      error={query.error}
      retry={() => query.refetch()}
    />{:else if items.length === 0}<Empty title="暂无交易"
      >{#if params.size}<Button variant="outline" onclick={clear}
          >清空筛选</Button
        >{:else}<Button href="/transactions/new">记一笔</Button>{/if}</Empty
    >{:else}
    <div class="space-y-3">
      {#each items as t, i (t.id)}
        {#if !i || date(t.occurred_at) !== date(items[i - 1].occurred_at)}<h2
            class="pt-4 pb-1 text-sm font-normal text-muted-foreground"
          >
            {date(t.occurred_at)}
          </h2>{/if}
        <a
          href={"/transactions/" + t.id + (filterKey ? "?" + filterKey : "")}
          class="finance-card block p-4 transition-colors hover:border-ring hover:bg-muted/30 sm:p-5"
        >
          <div class="flex justify-between gap-3">
            <div class="flex min-w-0 gap-3">
              <TransactionIcon
                category={transactionCategory(t, accounts.data ?? [])}
                kind={t.kind}
              />
              <div class="min-w-0">
                <p class="font-medium wrap-anywhere">
                  {t.merchant || t.notes || "未填写交易摘要"}
                </p>
                <p class="mt-1 text-sm text-muted-foreground">
                  {new Date(t.occurred_at).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Shanghai",
                  })} · {t.payment_method === "direct"
                    ? "直接交易"
                    : t.payment_method || "未填渠道"}
                </p>
              </div>
            </div>
            <div class="max-w-[45%] text-right">
              <p
                class="money break-words font-semibold"
                class:text-cash-in={t.kind === "income" || t.kind === "refund"}
              >
                {t.amount == null ? "金额待补录" : transactionMoney(t, hidden)}
              </p>
              <p class="mt-1 text-xs text-muted-foreground">
                {t.entry_count > 2
                  ? "多分录"
                  : t.kind === "transfer"
                    ? "划转"
                    : kindLabels[t.kind] || "交易"}
              </p>
            </div>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2 pl-15">
            {#if transactionCategory(t, accounts.data ?? [])}<Badge
                variant="secondary"
                >{transactionCategory(t, accounts.data ?? [])}</Badge
              >{/if}
            {#if !t.complete && t.status !== "cancel"}<Badge
                class="border-profit/20 bg-profit/10 text-profit"
                variant="outline"
                >{t.entry_count === 0
                  ? "待补录"
                  : t.missing_accounts
                    ? "待匹配科目"
                    : "待核对"}</Badge
              >{/if}
            {#if t.status !== "success"}<Badge variant="outline"
                >{statusLabels[t.status] || "待核对"}</Badge
              >{/if}
            <ChevronRight
              class="ml-auto size-4 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
        </a>
      {/each}
    </div>
  {/if}
  {#if query.hasNextPage}<Button
      variant="outline"
      class="w-full"
      disabled={query.isFetchingNextPage}
      onclick={() => query.fetchNextPage()}
      >{query.isFetchingNextPage ? "正在加载…" : "加载更多流水"}</Button
    >{/if}
</div>
