<script lang="ts">
  import { untrack } from "svelte";
  import { Plus, Trash2 } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import type { Account, Entry } from "$lib/types";
  import {
    allocateRemainder,
    roleAccounts,
    roleDirection,
    roleTotal,
    type BusinessLayout,
    type BusinessType,
    type EntryRole,
  } from "$lib/business-entries";
  import { amountSchema, money } from "$lib/finance";
  import AccountPicker from "./AccountPicker.svelte";
  import Field from "./Field.svelte";
  let {
    entries = $bindable(),
    accounts,
    initial,
    disabled = false,
  }: {
    entries: Entry[];
    accounts: Account[];
    initial: BusinessLayout;
    disabled?: boolean;
  } = $props();
  let layout = $state<BusinessLayout>(
    untrack(() => ({ type: initial.type, roles: [...initial.roles] })),
  );
  const count = (role: EntryRole) =>
    layout.roles.filter((r) => r === role).length;
  let groups = $derived<EntryRole[]>(
    layout.type === "转账"
      ? ["from", "to"]
      : layout.type === "收入"
        ? ["category", "deduction", "account"]
        : ["category", "account"],
  );
  let total = $derived(
    roleTotal(
      entries,
      layout.roles,
      layout.type === "转账" ? "from" : "category",
    ),
  );
  let knownTotal = $derived(
    entries.some(
      (_, i) =>
        layout.roles[i] === (layout.type === "转账" ? "from" : "category"),
    ) &&
      entries.every(
        (e, i) =>
          layout.roles[i] !== (layout.type === "转账" ? "from" : "category") ||
          amountSchema.safeParse(e.amount).success,
      ),
  );
  let net = $derived(
    total.minus(roleTotal(entries, layout.roles, "deduction")),
  );
  let allocated = $derived(
    roleTotal(entries, layout.roles, layout.type === "转账" ? "to" : "account"),
  );
  const typeLabel = (type: BusinessType) => (type === "转账" ? "划转" : type);
  const heading = (role: EntryRole) =>
    role === "category"
      ? "分类"
      : role === "deduction"
        ? "扣款"
        : role === "from"
          ? "转出账户"
          : role === "to"
            ? "转入账户"
            : layout.type === "收入"
              ? "到账账户"
              : "付款账户";
  function add(role: EntryRole) {
    layout.roles.push(role);
    entries.push({
      account_id: null,
      direction: roleDirection(layout.type, role),
      amount: "",
    });
  }
  function remove(i: number) {
    entries.splice(i, 1);
    layout.roles.splice(i, 1);
    allocateRemainder(entries, layout);
  }
  function amountChanged(i: number, amount: string) {
    entries[i].amount = amount;
    if (entries.length === 2 && layout.type !== "转账")
      entries[1 - i].amount = amount;
    else if (!["account", "to"].includes(layout.roles[i]))
      allocateRemainder(entries, layout);
  }
  function changeType(type: BusinessType) {
    if (type === layout.type || entries.length > 2) return;
    if (!entries.length)
      entries = [
        { account_id: null, direction: "借", amount: "" },
        { account_id: null, direction: "贷", amount: "" },
      ];
    if (type === "转账") {
      layout.roles = entries.map((_, i) =>
        layout.roles[i] === "account" ? "from" : "to",
      );
      entries.forEach((e, i) => {
        if (
          !roleAccounts(type, layout.roles[i], accounts).some(
            (a) => a.id === e.account_id,
          )
        )
          e.account_id = null;
      });
    } else if (layout.type === "转账") {
      layout.roles = entries.map((_, i) => (i === 0 ? "category" : "account"));
      entries[0].account_id = null;
    } else
      entries.forEach((e, i) => {
        if (layout.roles[i] === "category") e.account_id = null;
      });
    layout.type = type;
    entries.forEach(
      (e, i) => (e.direction = roleDirection(type, layout.roles[i])),
    );
  }
</script>

<fieldset
  {disabled}
  class="finance-card min-w-0 space-y-3 p-3 sm:p-4"
  aria-label="交易收支"
>
  <div
    class="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1"
    aria-label="交易类型"
  >
    {#each ["支出", "收入", "转账"] as type}
      <Button
        variant={layout.type === type ? "default" : "ghost"}
        aria-pressed={layout.type === type}
        disabled={disabled || entries.length > 2}
        onclick={() => changeType(type as BusinessType)}
        >{typeLabel(type as BusinessType)}</Button
      >
    {/each}
  </div>
  <div class="flex flex-wrap items-baseline justify-between gap-2">
    <span
      >{layout.type === "收入"
        ? "收入总额"
        : layout.type === "支出"
          ? "支出总额"
          : "划转总额"}</span
    >
    <strong
      class={knownTotal
        ? "money break-all text-2xl sm:text-3xl"
        : "text-base font-medium text-muted-foreground"}
      >{knownTotal ? money(total.toString()) : "待填写"}</strong
    >
  </div>
  {#each groups as role}
    <section class="min-w-0 border-t pt-1" aria-label={heading(role)}>
      <div class="flex min-h-12 items-center justify-between gap-2">
        <h2 class="text-base">{heading(role)}</h2>
        <Button
          class="shrink-0 px-2 text-muted-foreground"
          variant="ghost"
          disabled={disabled || entries.length >= 100}
          onclick={() => add(role)}
          ><Plus aria-hidden="true" />{role === "category"
            ? "拆分分类"
            : role === "deduction"
              ? "添加扣款"
              : layout.type === "转账"
                ? `添加${heading(role)}`
                : "添加账户"}</Button
        >
      </div>
      <div class="min-w-0 divide-y">
        {#each entries as entry, i}
          {#if layout.roles[i] === role}
            <div class="min-w-0 py-1">
              <div class="flex min-w-0 flex-wrap items-center gap-1">
                <div
                  class="min-w-0 flex-1"
                  class:basis-full={role === "deduction" || count(role) > 1}
                >
                  <AccountPicker
                    compact
                    label={role === "category" && count(role) === 1
                      ? "分类"
                      : role === "account" && count(role) === 1
                        ? "账户"
                        : `${heading(role)} ${layout.roles.slice(0, i + 1).filter((r) => r === role).length}`}
                    placeholder={`选择${heading(role)}`}
                    accounts={roleAccounts(layout.type, role, accounts)}
                    bind:value={entry.account_id}
                    {disabled}
                  />
                </div>
                {#if !(entries.length === 2 && role === "account")}
                  <div
                    class="ml-auto w-28 shrink-0"
                    class:flex-1={role === "deduction" || count(role) > 1}
                  >
                    <Field
                      compact
                      label={entries.length === 2 && role === "category"
                        ? "金额（人民币）"
                        : `${heading(role)}金额 ${layout.roles.slice(0, i + 1).filter((r) => r === role).length}`}
                      aria-invalid={entry.amount !== "" &&
                        !amountSchema.safeParse(entry.amount).success}
                      inputmode="decimal"
                      placeholder="0.00"
                      value={entry.amount}
                      oninput={(e) => amountChanged(i, e.currentTarget.value)}
                    />
                  </div>
                {/if}
                {#if role === "deduction" || count(role) > 1}<Button
                    variant="ghost"
                    size="icon"
                    aria-label={`删除${heading(role)} ${layout.roles.slice(0, i + 1).filter((r) => r === role).length}`}
                    onclick={() => remove(i)}
                    ><Trash2 aria-hidden="true" /></Button
                  >{/if}
              </div>
              {#if !(entries.length === 2 && role === "account") && entry.amount !== "" && !amountSchema.safeParse(entry.amount).success}<p
                  class="px-3 text-sm text-destructive"
                >
                  请输入正数金额，最多两位小数
                </p>{/if}
            </div>
          {/if}
        {/each}
      </div>
    </section>
  {/each}
  {#if layout.type === "收入" || entries.length > 2 || layout.type === "转账"}
    <div
      class="flex flex-wrap justify-between gap-2 rounded-xl bg-muted p-2"
      role="status"
    >
      <span
        >{layout.type === "收入"
          ? "实收"
          : layout.type === "支出"
            ? "实付"
            : "转入"}
        {money(allocated.toString())}</span
      >
      {#if !net.eq(allocated)}<span class="text-destructive"
          >待分配 {money(net.minus(allocated).toString())}</span
        >{:else}<span>已平衡</span>{/if}
    </div>
  {/if}
</fieldset>
