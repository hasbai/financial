<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import { ArrowRight, ArrowDown, ArrowUp, Wallet } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import * as Card from "$lib/components/ui/card";
  import { useApi, useAccounts } from "$lib/context";
  import {
    categoryLabels,
    currentMonth,
    money,
    monthRange,
  } from "$lib/finance";
  import { router } from "$lib/router.svelte";
  import Field from "../components/Field.svelte";
  import Loading from "../components/Loading.svelte";
  import Failure from "../components/Failure.svelte";
  import Empty from "../components/Empty.svelte";
  import Notice from "../components/Notice.svelte";
  import Trend from "../components/Trend.svelte";
  let { hidden }: { hidden: boolean } = $props();
  let month = $state(currentMonth());
  const api = useApi();
  const accounts = useAccounts();
  let cashConfigured = $derived(
    !!accounts.data?.some(
      (a) => a.type === "资产" && a.subtype === "现金及等价物",
    ),
  );
  let range = $derived(monthRange(month));
  const query = createQuery(() => ({
    queryKey: ["overview", month],
    queryFn: () =>
      api.overview(range.start, range.end, new Date().toISOString()),
  }));
  let data = $derived(query.data);
  function down(filters: Record<string, string>) {
    router.navigate(
      "/transactions?" +
        new URLSearchParams({
          start: range.start,
          end: range.end,
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
        value={month}
        onchange={(e) => {
          if (/^\d{4}-\d{2}$/.test(e.currentTarget.value))
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
    <Card.Root class="border-0 bg-primary text-primary-foreground"
      ><Card.Content class="p-6 sm:p-8">
        <div class="flex items-center justify-between">
          <span>已记录净资产</span><Wallet aria-hidden="true" />
        </div>
        <p class="money my-3 text-4xl font-semibold sm:text-5xl">
          {money(data.net_assets, hidden)}
        </p>
        <p class="text-sm opacity-85">
          截至 {new Date(data.as_of).toLocaleDateString("zh-CN", {
            timeZone: "Asia/Shanghai",
          })} · 人民币 · 账面余额
        </p>
        <div class="mt-6 flex flex-wrap gap-10 border-t border-current/20 pt-5">
          <div>
            <p class="text-sm">资产</p>
            <button
              class="money mt-2 text-xl"
              onclick={() => down({ account_type: "资产", start: "" })}
              >{money(data.assets, hidden)}</button
            >
          </div>
          <div>
            <p class="text-sm">负债</p>
            <button
              class="money mt-2 text-xl"
              onclick={() => down({ account_type: "负债", start: "" })}
              >{money(data.liabilities, hidden)}</button
            >
          </div>
        </div>
      </Card.Content></Card.Root
    >
    <div class="grid gap-6 lg:grid-cols-2">
      <Card.Root
        ><Card.Content class="space-y-4 p-6">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2>现金流量</h2>
            <Button variant="ghost" onclick={() => down({ cash: "true" })}
              >查看流水<ArrowRight aria-hidden="true" /></Button
            >
          </div>
          {#if accounts.error}<Failure
              error={accounts.error}
              retry={() => accounts.refetch()}
            />{:else if !accounts.isPending && !cashConfigured}<Notice
              variant="warning">未找到“资产 / 现金及等价物”科目。</Notice
            >{/if}
          <p class="text-sm text-muted-foreground">净流入</p>
          <p class="money text-3xl font-semibold">
            {cashConfigured ? money(data.cash_net, hidden) : "待确认"}
          </p>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <p class="flex items-center gap-1 text-sm text-muted-foreground">
                <ArrowDown class="size-4" aria-hidden="true" />对外流入
              </p>
              <p class="money mt-2 font-medium">
                {cashConfigured ? money(data.cash_in, hidden) : "—"}
              </p>
            </div>
            <div>
              <p class="flex items-center gap-1 text-sm text-muted-foreground">
                <ArrowUp class="size-4" aria-hidden="true" />对外流出
              </p>
              <p class="money mt-2 font-medium">
                {cashConfigured ? money(data.cash_out, hidden) : "—"}
              </p>
            </div>
          </div>
          <div class="space-y-2 border-t pt-4">
            {#if cashConfigured}{#each data.cash_categories as c}<div
                  class="flex flex-wrap justify-between gap-2 text-sm"
                >
                  <span class="text-muted-foreground"
                    >{categoryLabels[c.name]}</span
                  ><span
                    >入 {money(c.inflow, hidden)} / 出 {money(
                      c.outflow,
                      hidden,
                    )}</span
                  >
                </div>{/each}{/if}
          </div>
          <p class="text-xs leading-5 text-muted-foreground">
            现金流按每笔交易现金净变化计算，现金内部转账净额为零。
          </p>
        </Card.Content></Card.Root
      >
      <Card.Root
        ><Card.Content class="space-y-4 p-6">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2>本期损益</h2>
            <Badge variant="secondary">完整记录口径</Badge>
          </div>
          <p class="text-sm text-muted-foreground">净收益</p>
          <p class="money text-3xl font-semibold">
            {money(data.profit, hidden)}
          </p>
          <div class="flex flex-wrap gap-8">
            <div>
              <p class="text-sm text-muted-foreground">收入</p>
              <Button
                variant="link"
                class="money px-0"
                onclick={() => down({ account_type: "收入" })}
                >{money(data.income, hidden)}</Button
              >
            </div>
            <div>
              <p class="text-sm text-muted-foreground">支出</p>
              <Button
                variant="link"
                class="money px-0"
                onclick={() => down({ account_type: "支出" })}
                >{money(data.expense, hidden)}</Button
              >
            </div>
          </div>
          <p class="text-xs leading-5 text-muted-foreground">
            信用卡消费计入支出，还款不重复计入损益。
          </p>
        </Card.Content></Card.Root
      >
    </div>
    <Card.Root
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
