<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { useQueryClient, createQuery } from "@tanstack/svelte-query";
  import {
    Plus,
    Trash2,
    ArrowLeft,
    MoreHorizontal,
    UserRound,
    CalendarDays,
    NotebookPen,
    Check,
    CircleAlert,
    Sparkles,
  } from "@lucide/svelte";
  import * as Popover from "$lib/components/ui/popover";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { useApi, useAccounts } from "$lib/context";
  import { errorMessage } from "$lib/api";
  import { router } from "$lib/router.svelte";
  import EditorSurface from "../components/EditorSurface.svelte";
  import BusinessEntries from "../components/BusinessEntries.svelte";
  import { businessLayout, type BusinessLayout } from "$lib/business-entries";
  import { editorPayload, appendRefund, simpleEntrySlots } from "$lib/editor";
  import {
    localDateTime,
    fromLocalDateTime,
    money,
    totals,
    statusLabels,
    validatePost,
  } from "$lib/finance";
  import { transactionMoney } from "$lib/presentation";
  import TransactionIcon from "../components/TransactionIcon.svelte";
  import type { Transaction } from "$lib/types";
  import Field from "../components/Field.svelte";
  import SelectField from "../components/SelectField.svelte";
  import AccountPicker from "../components/AccountPicker.svelte";
  import Loading from "../components/Loading.svelte";
  import Failure from "../components/Failure.svelte";
  import Notice from "../components/Notice.svelte";
  let { original, hidden }: { original: Transaction | null; hidden: boolean } =
    $props();
  // Seed once. Cache refetches must never replace an in-progress form.
  let values = $state(untrack(() => editorPayload(original)));
  let saved = $state(untrack(() => original));
  let baseline = $state(untrack(() => JSON.stringify(values)));
  let dirty = $derived(JSON.stringify(values) !== baseline);
  let pending = $state(false);
  let advanced = $state(false);
  let business = $state<BusinessLayout | null | undefined>(undefined);
  let online = $state(navigator.onLine);
  let moreOpen = $state(false);
  let sourceOpen = $state(false);
  let formRevision = $state(0);
  let errors = $state<string[]>([]);
  let success = $state("");
  let uncertain = $state(false);
  let refundOpen = $state(false);
  let refundAmount = $state("");
  let refundError = $state("");
  let errorRef: HTMLDivElement | undefined = $state();
  const notesId = $props.id();
  const api = useApi();
  const accounts = useAccounts();
  const cache = useQueryClient();
  let sum = $derived(totals(values.entries));
  let slots = $derived(simpleEntrySlots(values, accounts.data ?? []));
  $effect(() => {
    if (accounts.data && business === undefined) {
      business = businessLayout(values, accounts.data);
    }
  });
  const suggestions = createQuery(() => ({
    queryKey: ["transactions", "suggestions", saved?.merchant],
    queryFn: () => api.list({ search: saved!.merchant, posted: "true" }, null),
    enabled: !!saved?.merchant && !!accounts.data,
    staleTime: 300_000,
  }));
  let suggestion = $derived(
    suggestions.data?.items.find(
      (t) =>
        t.id !== saved?.id &&
        values.merchant === saved?.merchant &&
        t.merchant === saved?.merchant &&
        t.complete &&
        simpleEntrySlots(t, accounts.data ?? [])?.type === slots?.type,
    ),
  );
  let suggestionSlots = $derived(
    suggestion ? simpleEntrySlots(suggestion, accounts.data ?? []) : null,
  );
  function ensurePair() {
    if (!values.entries.length)
      values.entries = [
        { account_id: null, direction: "借", amount: "" },
        { account_id: null, direction: "贷", amount: "" },
      ];
  }
  function setSimpleAccount(which: "category" | "account", id: number | null) {
    ensurePair();
    if (slots) values.entries[slots[which]].account_id = id;
  }
  function applySuggestion() {
    if (!suggestion || !suggestionSlots || !slots) return;
    const category = suggestion.entries[suggestionSlots.category].account_id;
    const account = suggestion.entries[suggestionSlots.account].account_id;
    setSimpleAccount("category", category);
    setSimpleAccount("account", account);
  }
  const statuses = Object.entries(statusLabels).map(([value, label]) => ({
    value,
    label,
  }));
  const channels = ["direct", "支付宝", "微信", "云闪付", "Apple"].map(
    (value) => ({ value, label: value === "direct" ? "直接交易" : value }),
  );
  const close = () => {
    if (!pending) router.navigate("/transactions" + router.location.search);
  };
  onMount(() => {
    const connectivity = () => (online = navigator.onLine);
    window.addEventListener("online", connectivity);
    window.addEventListener("offline", connectivity);
    const unguard = router.guard(
      () => !pending && (!dirty || window.confirm("放弃未保存修改？")),
    );
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty || pending) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("online", connectivity);
      window.removeEventListener("offline", connectivity);
      unguard();
      window.removeEventListener("beforeunload", unload);
    };
  });
  $effect(() => {
    if (errors.length) void tick().then(() => errorRef?.focus());
  });
  function reset(data: Transaction) {
    formRevision += 1;
    saved = data;
    values = editorPayload(data);
    business = businessLayout(values, accounts.data ?? []);
    baseline = JSON.stringify(values);
    uncertain = false;
    errors = [];
  }
  async function reload() {
    if (!saved || pending) return;
    pending = true;
    try {
      const latest = await api.transaction(saved.id);
      if (!latest) errors = ["记录不存在或没有访问权限。"];
      else if (window.confirm("重新载入？")) reset(latest);
    } catch (e) {
      errors = [errorMessage(e)];
    } finally {
      pending = false;
    }
  }
  async function submit(next = false) {
    if (pending || uncertain || !online || accounts.isPending || accounts.error)
      return;
    success = "";
    errors = validatePost(values);
    if (errors.length) return;
    pending = true;
    let data: Transaction;
    try {
      data = await api.save(
        saved?.id ?? null,
        saved?.updated_at ?? null,
        $state.snapshot(values),
      );
    } catch (e) {
      errors = [errorMessage(e)];
      uncertain = /fetch|network|timeout|Failed|Load failed/i.test(
        e instanceof Error ? e.message : "",
      );
      pending = false;
      return;
    }
    reset(data);
    success = "保存成功";
    try {
      await cache.invalidateQueries({
        predicate: (q) =>
          ["transactions", "transaction", "overview"].includes(
            String(q.queryKey[0]),
          ),
      });
      if (next) {
        const search = router.location.search;
        const filters = Object.fromEntries(new URLSearchParams(search));
        const page = await api.list(
          { ...filters, review: filters.review || "needed" },
          null,
        );
        const other = page.items.find((t) => t.id !== data.id);
        router.navigate(
          other
            ? "/transactions/" + other.id + search
            : "/transactions" + search,
          true,
          true,
        );
      } else if (!original)
        router.navigate("/transactions" + router.location.search, true, true);
    } catch (e) {
      errors = ["已保存，下一笔加载失败"];
    } finally {
      pending = false;
    }
  }
  async function removeTransaction() {
    if (!saved || pending || uncertain || !online) return;
    moreOpen = false;
    if (!window.confirm("删除这笔交易及全部分录？")) return;
    pending = true;
    errors = [];
    try {
      await api.deleteTransaction(saved.id, saved.updated_at);
    } catch (e) {
      errors = [errorMessage(e)];
      uncertain = /fetch|network|timeout|Failed|Load failed/i.test(
        e instanceof Error ? e.message : "",
      );
      pending = false;
      return;
    }
    baseline = JSON.stringify(values);
    await cache.invalidateQueries({
      predicate: (q) =>
        ["transactions", "transaction", "overview"].includes(
          String(q.queryKey[0]),
        ),
    });
    pending = false;
    router.navigate("/transactions" + router.location.search, true, true);
  }
  function addRefund() {
    try {
      values = appendRefund(
        $state.snapshot(values),
        accounts.data || [],
        refundAmount,
      );
      business = null;
      refundOpen = false;
      refundAmount = "";
      refundError = "";
      errors = [];
    } catch (e) {
      refundError = errorMessage(e);
    }
  }
</script>

<EditorSurface title={saved ? "修改交易" : "新增交易"} {close}>
  <header
    class="mobile-panel-header flex shrink-0 items-center gap-3 bg-card px-5 py-4 text-left"
  >
    <Button
      variant="ghost"
      size="icon"
      aria-label="关闭编辑"
      disabled={pending}
      onclick={close}><ArrowLeft class="size-6" aria-hidden="true" /></Button
    >
    <h1 class="min-w-0 flex-1 text-lg sm:text-xl">
      {saved ? "修改交易" : "新增交易"}
    </h1>
    <Popover.Root bind:open={moreOpen}
      ><Popover.Trigger
        >{#snippet child({ props })}<Button
            {...props}
            variant="ghost"
            size="icon"
            aria-label="交易操作"><MoreHorizontal aria-hidden="true" /></Button
          >{/snippet}</Popover.Trigger
      ><Popover.Content class="w-48 p-2"
        ><Button
          class="w-full justify-start"
          variant="ghost"
          onclick={() => {
            if (advanced)
              business = businessLayout(values, accounts.data ?? []);
            advanced = !advanced;
            moreOpen = false;
          }}>分录明细</Button
        ><Button
          class="w-full justify-start"
          variant="ghost"
          onclick={() => {
            sourceOpen = !sourceOpen;
            moreOpen = false;
          }}>交易来源</Button
        >{#if saved}<Button
            class="w-full justify-start"
            variant="ghost"
            disabled={pending}
            onclick={() => {
              refundOpen = true;
              refundError = "";
              moreOpen = false;
            }}>补记退款</Button
          ><Button
            class="w-full justify-start"
            variant="ghost"
            disabled={pending ||
              uncertain ||
              !online ||
              accounts.isPending ||
              !!accounts.error ||
              !sum.借.eq(sum.贷)}
            onclick={() => {
              moreOpen = false;
              submit(true);
            }}>保存并下一笔</Button
          ><Button
            class="w-full justify-start text-destructive"
            variant="ghost"
            disabled={pending || uncertain || !online}
            onclick={removeTransaction}
            ><Trash2 aria-hidden="true" />删除交易</Button
          >{/if}</Popover.Content
      ></Popover.Root
    >
  </header>
  <div
    class="editor-scroll min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-background px-5 py-5 sm:px-6"
  >
    {#if saved}<section class="finance-card p-5" aria-label="原交易摘要">
        <div class="flex items-start gap-3">
          <TransactionIcon kind={saved.kind} />
          <div class="min-w-0 flex-1">
            <p class="font-semibold wrap-anywhere">
              {saved.merchant || "未命名交易"}
            </p>
            <p class="mt-2 text-sm text-muted-foreground">
              {new Date(saved.occurred_at).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <p class="mt-1 text-sm text-muted-foreground">
              {saved.payment_method || "未填渠道"}
            </p>
          </div>
          <div class="max-w-[45%] text-right">
            <p class="money break-words text-xl font-semibold">
              {saved.amount === null ? "待补录" : transactionMoney(saved)}
            </p>
            {#if !saved.complete || saved.status !== "success"}<span
                class="mt-3 inline-block rounded-full bg-profit/10 px-3 py-1 text-sm text-profit"
                >{!saved.complete
                  ? "待补录"
                  : statusLabels[saved.status] || "待核对"}</span
              >{/if}
          </div>
        </div>
        {#if saved.notes}<blockquote class="mt-4 text-muted-foreground">
            “{saved.notes}”
          </blockquote>{/if}
      </section>{/if}
    {#if errors.length}<div
        bind:this={errorRef}
        tabindex="-1"
        class="rounded-lg outline-none"
      >
        <Notice variant="error"
          >{#each errors as error}<p>
              {error}
            </p>{/each}{#if saved && errors.some((e) => e.includes("更新") || e.includes("请求") || e.includes("失败"))}<Button
              variant="outline"
              disabled={pending}
              onclick={reload}>重新载入</Button
            >{/if}</Notice
        >
      </div>{/if}
    {#if uncertain}<Notice variant="warning"
        >操作待核对<Button variant="link" onclick={close}>查看流水</Button
        ></Notice
      >{/if}
    {#if success}<Notice variant="success">{success}</Notice>{/if}

    {#if suggestion && suggestionSlots && slots && !advanced}<section
        class="finance-card bg-asset/5 p-4"
        aria-label="科目建议"
      >
        <div class="mb-3 flex items-center justify-between">
          <h2 class="flex items-center gap-2">
            <Sparkles class="size-5 text-asset" aria-hidden="true" />科目建议
          </h2>
          <Button variant="outline" disabled={pending} onclick={applySuggestion}
            >一键应用</Button
          >
        </div>
        <div class="grid grid-cols-2 gap-3">
          <span class="rounded-xl bg-card p-3"
            >{accounts.data?.find(
              (a) =>
                a.id ===
                suggestion!.entries[suggestionSlots!.category].account_id,
            )?.name}</span
          ><span class="rounded-xl bg-card p-3"
            >{accounts.data?.find(
              (a) =>
                a.id ===
                suggestion!.entries[suggestionSlots!.account].account_id,
            )?.name}</span
          >
        </div>
      </section>{/if}
    {#if !online}<Notice variant="warning">离线</Notice>{/if}
    {#if accounts.isPending}<Loading />{:else if accounts.error}<Failure
        error={accounts.error}
        retry={() => accounts.refetch()}
      />{:else if business && !advanced}
      {#key formRevision}<BusinessEntries
          bind:entries={values.entries}
          accounts={accounts.data ?? []}
          initial={business}
          disabled={pending || uncertain}
        />{/key}
    {/if}
    <fieldset
      disabled={pending}
      class="finance-card min-w-0 divide-y px-4 sm:px-5"
    >
      <div class="editor-row">
        <span class="editor-label"><UserRound aria-hidden="true" />对方</span
        ><Field
          compact
          label="商户 / 交易摘要"
          placeholder="添加对方"
          bind:value={values.merchant}
        />
      </div>
      <div class="editor-row">
        <span class="editor-label"><CalendarDays aria-hidden="true" />时间</span
        ><Field
          compact
          label="交易时间（北京时间）"
          type="datetime-local"
          value={values.occurred_at ? localDateTime(values.occurred_at) : ""}
          onchange={(e) => {
            try {
              values.occurred_at = fromLocalDateTime(e.currentTarget.value);
            } catch {
              values.occurred_at = "";
            }
          }}
        />
      </div>
      <div class="editor-row">
        <span class="editor-label"><NotebookPen aria-hidden="true" />备注</span
        ><Label for={notesId} class="sr-only">备注</Label><Textarea
          class="col-start-2 min-h-12 rounded-xl border-transparent bg-transparent shadow-none"
          id={notesId}
          rows={1}
          bind:value={values.notes}
          placeholder="添加备注"
        />
      </div>
      {#if sourceOpen}<div class="space-y-4 py-4">
          <SelectField
            label="交易状态"
            bind:value={values.status}
            options={statuses}
            disabled={pending}
          /><SelectField
            label="支付渠道"
            bind:value={values.payment_method}
            options={channels}
            disabled={pending}
          /><Field label="支付流水号" bind:value={values.payment_id} />
        </div>{/if}
    </fieldset>
    {#if advanced || business === null}<fieldset
        disabled={pending}
        class="finance-card min-w-0 space-y-5 p-4 sm:p-5"
      >
        <h2>分录明细</h2>
        {#if !values.entries.length && accounts.data}<Button
            class="w-full"
            variant="outline"
            onclick={() => {
              ensurePair();
              business = businessLayout(values, accounts.data ?? []);
              advanced = false;
            }}>开始补录</Button
          >{/if}
        {#if accounts.isPending}<Loading />{:else if accounts.error}<Failure
            error={accounts.error}
            retry={() => accounts.refetch()}
          />{:else}
          {#each values.entries as entry, i}
            <section
              class="space-y-4 rounded-xl border p-4"
              aria-label={`分录 ${i + 1}`}
            >
              <div class="flex items-end gap-2">
                <h3 class="mb-3 flex-1 text-sm text-muted-foreground">
                  分录 {i + 1}
                </h3>
                <div class="w-24">
                  <SelectField
                    label={`方向 ${i + 1}`}
                    value={entry.direction}
                    options={[
                      { value: "借", label: "借" },
                      { value: "贷", label: "贷" },
                    ]}
                    disabled={pending}
                    onchange={(v) => (entry.direction = v as "借" | "贷")}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`删除分录 ${i + 1}`}
                  onclick={() => values.entries.splice(i, 1)}
                  ><Trash2 aria-hidden="true" /></Button
                >
              </div>
              <AccountPicker
                accounts={accounts.data || []}
                bind:value={entry.account_id}
                disabled={pending}
              />
              <Field
                label="金额（人民币）"
                bind:value={entry.amount}
                inputmode="decimal"
              />
              {#if i === 0 && values.entries.length === 2}<Button
                  variant="ghost"
                  onclick={() =>
                    (values.entries[1].amount = values.entries[0].amount)}
                  >同步金额到另一条分录</Button
                >{/if}
            </section>
          {/each}
        {/if}
        <Button
          variant="outline"
          class="w-full"
          disabled={pending ||
            values.entries.length >= 100 ||
            accounts.isPending ||
            !!accounts.error}
          onclick={() =>
            values.entries.push({
              direction: "借",
              account_id: null,
              amount: "",
            })}><Plus aria-hidden="true" />添加分录</Button
        >
        <div
          class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted p-3"
          role="status"
        >
          <span>借 {money(sum["借"].toString())}</span><span
            >贷 {money(sum["贷"].toString())}</span
          ><span
            class="flex items-center gap-2"
            class:text-profit={!sum["借"].eq(sum["贷"])}
            >{#if sum["借"].eq(sum["贷"])}<Check
                class="size-4"
                aria-hidden="true"
              />平衡{:else}<CircleAlert class="size-4" aria-hidden="true" />差额 {money(
                sum["借"].minus(sum["贷"]).toString(),
              )}{/if}</span
          >
        </div>
      </fieldset>{/if}
  </div>
  <footer
    class="grid shrink-0 grid-cols-2 gap-3 border-t bg-card px-5 py-4 pb-[max(16px,env(safe-area-inset-bottom))]"
  >
    <Button
      class="h-14 rounded-2xl"
      variant="secondary"
      disabled={pending}
      onclick={close}>取消</Button
    ><Button
      class="h-14 rounded-2xl"
      disabled={pending ||
        uncertain ||
        !online ||
        accounts.isPending ||
        !!accounts.error ||
        !sum.借.eq(sum.贷)}
      onclick={() => submit()}
      >{pending ? "正在保存…" : saved ? "保存修改" : "保存交易"}</Button
    >
  </footer>
</EditorSurface>
<Dialog.Root bind:open={refundOpen}>
  <Dialog.Content showCloseButton={false} class="max-h-[90dvh] overflow-y-auto"
    ><Dialog.Header
      ><Dialog.Title>补记退款</Dialog.Title><Dialog.Description class="sr-only"
        >本笔退款</Dialog.Description
      ></Dialog.Header
    >
    {#if refundError}<Notice variant="error">{refundError}</Notice>{/if}<Field
      label="退款金额"
      bind:value={refundAmount}
      inputmode="decimal"
    />
    <Dialog.Footer
      ><Button variant="outline" onclick={() => (refundOpen = false)}
        >取消</Button
      ><Button onclick={addRefund}>添加退款分录</Button></Dialog.Footer
    >
  </Dialog.Content>
</Dialog.Root>
