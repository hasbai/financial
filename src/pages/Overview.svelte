<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import {
    ChevronRight,
    Database,
    Landmark,
    TrendingUp,
    Wallet,
    ReceiptText,
  } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import * as Card from "$lib/components/ui/card";
  import { useApi } from "$lib/context";
  import { currentMonth, money, monthRange } from "$lib/finance";
  import { router } from "$lib/router.svelte";
  import Field from "../components/Field.svelte";
  import Loading from "../components/Loading.svelte";
  import Failure from "../components/Failure.svelte";
  import Empty from "../components/Empty.svelte";
  import Notice from "../components/Notice.svelte";
  import Trend from "../components/Trend.svelte";
  import Cashflow from "../components/Cashflow.svelte";
  let { hidden }: { hidden: boolean } = $props();
  let month = $state(currentMonth());
  const api = useApi();
  const now = new Date().toISOString();
  let range = $derived(monthRange(month));
  const query = createQuery(() => ({
    queryKey: ["overview", month],
    queryFn: () => api.overview(range.start, range.end, now),
  }));
  let data = $derived(query.data);
  const recent = createQuery(() => ({
    queryKey: ["transactions", "recent"],
    queryFn: () => api.list({}, null),
  }));
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
</script>

<div class="page">
  <div class="page-heading">
    <div>
      <h1>财务总览</h1>
      <p class="mt-2 text-muted-foreground">收支有迹，生活有序。</p>
    </div>
    <div class="max-w-44">
      <Field
        label="报表月份"
        type="month"
        max={currentMonth()}
        value={month}
        onchange={(e) => {
          if (
            /^\d{4}-\d{2}$/.test(e.currentTarget.value) &&
            e.currentTarget.value <= currentMonth()
          )
            month = e.currentTarget.value;
        }}
      />
    </div>
  </div>
  {#if query.isPending}<Loading />{:else if query.error}<Failure
      error={query.error}
      retry={() => query.refetch()}
    />{:else if data}
    <Notice
      >{data.quality.pending} 笔交易待补录。以下仅反映完整交易的已记录范围，请核对期初覆盖情况。<Button
        href="/transactions?review=needed"
        variant="link">去核对</Button
      ></Notice
    >
    <section
      class="finance-card relative overflow-hidden p-6 sm:p-8"
      aria-label="净资产"
    >
      <div
        class="pointer-events-none absolute -top-16 -right-12 size-72 rounded-full bg-cash-in/5 blur-3xl"
        aria-hidden="true"
      ></div>
      <div class="relative">
        <div class="flex items-center gap-3">
          <span class="icon-tile bg-asset/10 text-asset"
            ><Database class="size-5" aria-hidden="true" /></span
          >
          <h2>已记录净资产</h2>
        </div>
        <p class="money mt-5 break-words text-4xl font-semibold sm:text-5xl">
          {money(data.net_assets, hidden)}
        </p>
        <p class="mt-4 text-xs leading-6 text-muted-foreground">
          截至 {new Date(data.as_of).toLocaleDateString("zh-CN", {
            timeZone: "Asia/Shanghai",
          })} · 人民币 · 账面余额
        </p>
      </div>
    </section>
    <div class="grid grid-cols-2 gap-3 sm:gap-5">
      <button
        class="finance-card min-w-0 p-4 text-left transition-colors hover:bg-accent sm:p-6"
        onclick={() => down({ account_type: "资产", start: "" })}
      >
        <span class="flex items-center gap-2 sm:gap-3"
          ><span class="icon-tile bg-asset/10 text-asset"
            ><Wallet class="size-5" aria-hidden="true" /></span
          ><span class="font-medium">总资产</span><ChevronRight
            class="ml-auto size-4 text-muted-foreground"
            aria-hidden="true"
          /></span
        >
        <span
          class="money mt-4 block break-words text-xl font-semibold sm:text-2xl"
          >{money(data.assets, hidden)}</span
        ><span class="mt-2 block text-xs text-muted-foreground"
          >已记录资产余额</span
        >
      </button>
      <button
        class="finance-card min-w-0 p-4 text-left transition-colors hover:bg-accent sm:p-6"
        onclick={() => down({ account_type: "负债", start: "" })}
      >
        <span class="flex items-center gap-2 sm:gap-3"
          ><span class="icon-tile bg-cash-out/10 text-cash-out"
            ><Landmark class="size-5" aria-hidden="true" /></span
          ><span class="font-medium">总负债</span><ChevronRight
            class="ml-auto size-4 text-muted-foreground"
            aria-hidden="true"
          /></span
        >
        <span
          class="money mt-4 block break-words text-xl font-semibold sm:text-2xl"
          >{money(data.liabilities, hidden)}</span
        ><span class="mt-2 block text-xs text-muted-foreground"
          >已记录负债余额</span
        >
      </button>
    </div>
    <Cashflow {hidden} report={data} {range} {now} />
    <section class="finance-card p-5 sm:p-7" aria-label="本期损益">
      <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 class="flex items-center gap-3">
          <span class="icon-tile bg-profit/10 text-profit"
            ><TrendingUp class="size-5" aria-hidden="true" /></span
          >本期损益
        </h2>
        <Badge variant="secondary">完整记录口径</Badge>
      </div>
      <div class="grid grid-cols-3 divide-x">
        <div class="min-w-0 pr-3 sm:pr-6">
          <p class="text-xs text-muted-foreground sm:text-sm">本期收入</p>
          <button
            class="money mt-2 min-h-12 break-words text-left font-semibold sm:text-2xl"
            onclick={() => down({ account_type: "收入" })}
            >{money(data.income, hidden)}</button
          >
        </div>
        <div class="min-w-0 px-3 sm:px-6">
          <p class="text-xs text-muted-foreground sm:text-sm">本期支出</p>
          <button
            class="money mt-2 min-h-12 break-words text-left font-semibold sm:text-2xl"
            onclick={() => down({ account_type: "支出" })}
            >{money(data.expense, hidden)}</button
          >
        </div>
        <div class="min-w-0 pl-3 sm:pl-6">
          <p class="text-xs text-muted-foreground sm:text-sm">净收益</p>
          <p
            class="money mt-2 content-center min-h-12 break-words font-semibold sm:text-2xl"
          >
            {money(data.profit, hidden)}
          </p>
        </div>
      </div>
      <p class="mt-4 text-xs leading-5 text-muted-foreground">
        信用卡消费计入支出，还款不重复计入损益。
      </p>
    </section>
    <section class="finance-card p-5 sm:p-7" aria-label="最近交易">
      <div class="flex items-center justify-between gap-2">
        <h2 class="flex items-center gap-3">
          <span class="icon-tile bg-muted text-muted-foreground"
            ><ReceiptText class="size-5" aria-hidden="true" /></span
          >最近交易
        </h2>
        <Button href="/transactions" variant="ghost"
          >查看全部<ChevronRight aria-hidden="true" /></Button
        >
      </div>
      {#if recent.isPending}<Loading />{:else if recent.error}<Failure
          error={recent.error}
          retry={() => recent.refetch()}
        />{:else if !recent.data?.items.length}<p
          class="py-8 text-center text-sm text-muted-foreground"
        >
          暂无交易，记下第一笔收支。
        </p>{:else}
        <div class="mt-3 divide-y">
          {#each recent.data.items.slice(0, 3) as transaction}<a
              href={`/transactions/${transaction.id}`}
              class="flex min-w-0 items-center gap-3 py-4 transition-colors hover:text-primary"
              ><span class="icon-tile bg-muted text-muted-foreground"
                ><ReceiptText class="size-5" aria-hidden="true" /></span
              ><span class="min-w-0 flex-1"
                ><span class="block truncate font-medium"
                  >{transaction.merchant ||
                    transaction.notes ||
                    "未填写交易摘要"}</span
                ><span class="mt-1 block text-xs text-muted-foreground"
                  >{new Date(transaction.occurred_at).toLocaleDateString(
                    "zh-CN",
                    {
                      timeZone: "Asia/Shanghai",
                      month: "long",
                      day: "numeric",
                    },
                  )} · {transaction.complete
                    ? transaction.payment_method || "未填渠道"
                    : "待补录"}</span
                ></span
              ><span
                class="money max-w-[45%] break-words text-right font-semibold"
                >{transaction.amount === null
                  ? "金额待补录"
                  : money(transaction.amount, hidden)}</span
              ><ChevronRight
                class="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              /></a
            >{/each}
        </div>
      {/if}
    </section>
    <Card.Root class="finance-card py-0"
      ><Card.Content class="space-y-5 p-6"
        ><h2>本月收支趋势</h2>
        {#if hidden}<div
            class="grid h-52 place-items-center text-muted-foreground"
          >
            金额已隐藏
          </div>{:else if data.trend.length === 0}<p
            class="py-10 text-center text-muted-foreground"
          >
            本月暂无完整记录交易。先去核对流水。
          </p>{:else}<Trend data={data.trend} />{/if}
        {#each data.categories as c}<div
            class="flex justify-between gap-4 border-t pt-3 text-sm"
          >
            <span>{c.type} · {c.name}</span><span class="money"
              >{money(c.amount, hidden)}</span
            >
          </div>{/each}
      </Card.Content></Card.Root
    >
    <section class="space-y-3">
      <h2>科目余额</h2>
      {#if data.accounts.length === 0}<Empty
          title="等待第一笔正式入账"
          description="补全历史流水后，资产负债与损益会按统一口径自动更新。"
        />{:else}
        {#each data.accounts.filter( (a) => ["资产", "负债"].includes(a.type) ) as a}<button
            class="flex w-full items-center justify-between gap-4 rounded-xl border bg-card p-5 text-left transition-colors hover:bg-muted"
            onclick={() => down({ account_id: String(a.id), start: "" })}
            ><span
              ><span class="block font-medium">{a.name}</span><span
                class="text-sm text-muted-foreground"
                >{a.type} / {a.subtype}</span
              ></span
            ><span class="money">{money(a.balance, hidden)}</span></button
          >{/each}
      {/if}
    </section>
    <p class="text-xs text-muted-foreground">
      完整记录 {data.quality.posted} 笔 · 缺少分录 {data.quality
        .missing_entries} 笔 · 缺少科目 {data.quality.missing_accounts} 笔
    </p>
  {/if}
</div>
