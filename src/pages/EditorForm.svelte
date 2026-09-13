<script lang="ts">
  import { onMount, tick, untrack } from "svelte";
  import { useQueryClient } from "@tanstack/svelte-query";
  import { Plus, Trash2, X } from "@lucide/svelte";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Textarea } from "$lib/components/ui/textarea";
  import { useApi, useAccounts } from "$lib/context";
  import { errorMessage } from "$lib/api";
  import { router } from "$lib/router.svelte";
  import { editorPayload, appendRefund } from "$lib/editor";
  import {
    localDateTime,
    fromLocalDateTime,
    money,
    totals,
    statusLabels,
    validatePost,
  } from "$lib/finance";
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
    const unguard = router.guard(
      () =>
        !pending &&
        (!dirty ||
          window.confirm(
            "有尚未保存的修改。离开会丢失当前修改，是否放弃并离开？",
          )),
    );
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty || pending) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      unguard();
      window.removeEventListener("beforeunload", unload);
    };
  });
  $effect(() => {
    if (errors.length) void tick().then(() => errorRef?.focus());
  });
  function reset(data: Transaction) {
    saved = data;
    values = editorPayload(data);
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
      else if (window.confirm("重新载入会替换当前输入，是否继续？"))
        reset(latest);
    } catch (e) {
      errors = [errorMessage(e)];
    } finally {
      pending = false;
    }
  }
  async function submit(next = false) {
    if (pending || uncertain) return;
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
        router.navigate(
          "/transactions/" + data.id + router.location.search,
          true,
          true,
        );
    } catch (e) {
      errors = ["本笔已保存，刷新或加载下一笔失败：" + errorMessage(e)];
    } finally {
      pending = false;
    }
  }
  function addRefund() {
    try {
      values = appendRefund(
        $state.snapshot(values),
        accounts.data || [],
        refundAmount,
      );
      refundOpen = false;
      refundAmount = "";
      refundError = "";
      errors = [];
    } catch (e) {
      refundError = errorMessage(e);
    }
  }
</script>

<Dialog.Root
  open={true}
  onOpenChange={(v) => {
    if (!v) close();
  }}
>
  <Dialog.Content
    showCloseButton={false}
    class="flex max-h-dvh max-w-full flex-col gap-0 rounded-none p-0 sm:max-h-[92dvh] sm:max-w-2xl sm:rounded-4xl"
    onEscapeKeydown={(e) => {
      e.preventDefault();
      close();
    }}
    onInteractOutside={(e) => {
      e.preventDefault();
      close();
    }}
  >
    <Dialog.Header
      class="flex-row items-center justify-between border-b px-5 py-4 text-left"
      ><div>
        <Dialog.Title>{saved ? "补全交易 #" + saved.id : "记一笔"}</Dialog.Title
        ><Dialog.Description class="sr-only"
          >编辑交易信息与借贷分录，保存后更新账本。</Dialog.Description
        >
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="关闭编辑"
        disabled={pending}
        onclick={close}><X aria-hidden="true" /></Button
      ></Dialog.Header
    >
    <div
      class="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6"
    >
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
          >网络中断，保存结果尚未确认。请先在流水中核对，避免重复新增。</Notice
        >{/if}
      {#if success}<Notice variant="success">{success}</Notice>{/if}
      {#if hidden}<Notice>编辑时显示金额，关闭后恢复隐藏。</Notice>{/if}
      <fieldset disabled={pending} class="min-w-0 space-y-5">
        <Field
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
        <Field label="商户 / 交易摘要" bind:value={values.merchant} />
        <div class="space-y-2">
          <Label for={notesId}>备注</Label><Textarea
            id={notesId}
            rows={2}
            bind:value={values.notes}
          />
        </div>
        <div class="grid grid-cols-2 gap-4">
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
          />
        </div>
        <Field label="支付流水号（可选）" bind:value={values.payment_id} />
        <div class="border-t pt-5">
          <h2>分录与科目</h2>
          <p class="mt-1 text-sm leading-6 text-muted-foreground">
            支出：借记支出科目，贷记付款账户；收入则借记收款账户，贷记收入科目。
          </p>
        </div>
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
          onclick={() =>
            values.entries.push({
              direction: "借",
              account_id: null,
              amount: "",
            })}><Plus aria-hidden="true" />添加分录</Button
        >
        <Notice variant={sum["借"].eq(sum["贷"]) ? "info" : "warning"}
          >借方 {money(sum["借"].toString())} / 贷方 {money(
            sum["贷"].toString(),
          )}<br />差额 {money(sum["借"].minus(sum["贷"]).toString())}</Notice
        >
        {#if saved}<Button
            variant="outline"
            onclick={() => {
              refundError = "";
              refundOpen = true;
            }}>在本笔交易补记退款</Button
          >{/if}
      </fieldset>
    </div>
    <Dialog.Footer
      class="shrink-0 flex-row flex-wrap justify-end gap-2 border-t px-5 py-4 pb-[max(16px,env(safe-area-inset-bottom))]"
      >{#if saved}<Button
          variant="outline"
          disabled={pending || uncertain}
          onclick={() => submit(true)}>保存并下一笔</Button
        >{/if}<Button disabled={pending || uncertain} onclick={() => submit()}
        >{pending ? "正在保存…" : "保存"}</Button
      ></Dialog.Footer
    >
  </Dialog.Content>
</Dialog.Root>
<Dialog.Root bind:open={refundOpen}>
  <Dialog.Content showCloseButton={false} class="max-h-[90dvh] overflow-y-auto"
    ><Dialog.Header
      ><Dialog.Title>补记退款</Dialog.Title><Dialog.Description
        >退款借贷分录添加到当前交易，保留原分录；报表按净额及当前交易日期计算。</Dialog.Description
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
