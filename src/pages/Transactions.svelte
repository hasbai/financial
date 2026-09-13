<script lang="ts">
  import { createInfiniteQuery } from "@tanstack/svelte-query";
  import {
    ReceiptText,
    SlidersHorizontal,
    ArrowRight,
    ArrowDownLeft,
    ArrowUpRight,
    ArrowLeftRight,
  } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import * as Card from "$lib/components/ui/card";
  import { useApi, useAccounts } from "$lib/context";
  import { router } from "$lib/router.svelte";
  import { money, statusLabels, kindLabels } from "$lib/finance";
  import type { Cursor } from "$lib/types";
  import Field from "../components/Field.svelte";
  import SelectField from "../components/SelectField.svelte";
  import AccountPicker from "../components/AccountPicker.svelte";
  import Loading from "../components/Loading.svelte";
  import Failure from "../components/Failure.svelte";
  import Empty from "../components/Empty.svelte";
  import Notice from "../components/Notice.svelte";
  let { hidden }: { hidden: boolean } = $props();
  const api = useApi();
  const accounts = useAccounts();
  let expanded = $state(false);
  let search = $state("");
  let params = $derived(new URLSearchParams(router.location.search));
  let filterKey = $derived(params.toString());
  let filters = $derived(Object.fromEntries(params));
  $effect(() => {
    search = new URLSearchParams(filterKey).get("search") || "";
  });
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
    initialPageParam: null as Cursor,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  }));
  let items = $derived(query.data?.pages.flatMap((p) => p.items) || []);
  $effect(() => {
    const key = "financial.scroll." + filterKey;
    const path = router.location.pathname;
    if (path !== "/transactions") return;
    const savedY = sessionStorage.getItem(key);
    const frame = savedY
      ? requestAnimationFrame(() => window.scrollTo(0, Number(savedY)))
      : null;
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
</script>

<div class="page">
  <div>
    <h1>交易流水</h1>
    <p class="mt-2 text-muted-foreground">把每一笔，整理清楚。</p>
  </div>
  <form
    class="flex items-end gap-2"
    onsubmit={(e) => {
      e.preventDefault();
      update("search", search);
    }}
  >
    <div class="min-w-0 flex-1">
      <Field label="搜索商户或摘要" type="search" bind:value={search} />
    </div>
    <Button type="submit" variant="outline">搜索</Button><Button
      variant="ghost"
      size="icon"
      aria-label="展开筛选"
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
      ><SlidersHorizontal aria-hidden="true" /></Button
    >
  </form>
  <div class="flex flex-wrap gap-2" aria-label="补录筛选">
    {#each [["", "全部"], ["needed", "待补录"], ["unmatched", "待匹配"]] as [v, label]}<Button
        variant={(params.get("review") || "") === v ? "default" : "outline"}
        aria-pressed={(params.get("review") || "") === v}
        onclick={() => update("review", v)}>{label}</Button
      >{/each}
  </div>
  {#if expanded}<Card.Root
      ><Card.Content class="space-y-4 p-5">
        <div class="grid gap-4 sm:grid-cols-2">
          <Field
            label="起始日期"
            type="date"
            value={params.get("start")?.slice(0, 10) || ""}
            onchange={(e) =>
              update(
                "start",
                e.currentTarget.value
                  ? e.currentTarget.value + "T00:00:00+08:00"
                  : "",
              )}
          /><Field
            label="结束日期（不含）"
            type="date"
            value={params.get("end")?.slice(0, 10) || ""}
            onchange={(e) =>
              update(
                "end",
                e.currentTarget.value
                  ? e.currentTarget.value + "T00:00:00+08:00"
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
        <Button variant="ghost" onclick={clear}>清空全部筛选</Button>
      </Card.Content></Card.Root
    >{/if}
  {#if params.get("posted") || params.get("account_type") || params.get("cash")}<Notice
      >正在查看报表同口径下钻结果。<Button variant="link" onclick={clear}
        >查看全部流水</Button
      ></Notice
    >{/if}
  {#if query.isPending}<Loading />{:else if query.error}<Failure
      error={query.error}
      retry={() => query.refetch()}
    />{:else if items.length === 0}<Empty
      title="这里已经整理好了"
      description="当前筛选没有流水。可切换条件，或记下新的一笔。"
      ><Button href="/transactions/new">记一笔</Button></Empty
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
              <div
                class={[
                  "grid size-11 shrink-0 place-items-center rounded-2xl",
                  t.kind === "income" || t.kind === "refund"
                    ? "bg-cash-in/10 text-cash-in"
                    : t.kind === "expense"
                      ? "bg-cash-out/10 text-cash-out"
                      : "bg-muted text-primary",
                ]}
              >
                {#if t.kind === "income" || t.kind === "refund"}<ArrowDownLeft
                    class="size-5"
                    aria-hidden="true"
                  />{:else if t.kind === "expense"}<ArrowUpRight
                    class="size-5"
                    aria-hidden="true"
                  />{:else if t.kind === "transfer"}<ArrowLeftRight
                    class="size-5"
                    aria-hidden="true"
                  />{:else}<ReceiptText
                    class="size-5"
                    aria-hidden="true"
                  />{/if}
              </div>
              <div class="min-w-0">
                <p class="font-medium wrap-anywhere">
                  {t.merchant || t.notes || "未填写交易摘要"}
                </p>
                <p class="mt-1 text-sm text-muted-foreground">
                  {new Date(t.occurred_at).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Shanghai",
                  })} · {t.payment_method || "未填渠道"}
                </p>
              </div>
            </div>
            <div class="max-w-[45%] text-right">
              <p class="money break-words font-semibold">
                {t.amount == null ? "金额待补录" : money(t.amount, hidden)}
              </p>
              <p class="mt-1 text-xs text-muted-foreground">
                {t.entry_count > 2 ? "多分录" : kindLabels[t.kind] || "交易"}
              </p>
            </div>
          </div>
          <div class="mt-4 flex flex-wrap items-center gap-2">
            <Badge variant="outline"
              >{statusLabels[t.status] || "状态待确认"}</Badge
            ><Badge
              variant={t.complete ? "secondary" : "outline"}
              class={!t.complete
                ? "border-profit/20 bg-profit/10 text-profit"
                : ""}>{t.complete ? "信息完整" : "待补录"}</Badge
            >{#if !t.complete && t.status !== "cancel"}<span
                class="flex items-center gap-1 text-xs text-muted-foreground"
                >{t.entry_count === 0
                  ? "缺少分录"
                  : t.missing_accounts
                    ? "待匹配科目"
                    : "待核对"}<ArrowRight
                  class="size-3"
                  aria-hidden="true"
                /></span
              >{/if}
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
    >{:else if items.length > 0}<p
      class="border-t pt-5 text-center text-sm text-muted-foreground"
    >
      已显示全部 {items.length} 笔
    </p>{/if}
</div>
