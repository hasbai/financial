<script lang="ts">
  import { createMutation, useQueryClient } from "@tanstack/svelte-query";
  import { ArrowLeft, Plus } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { Badge } from "$lib/components/ui/badge";
  import * as Dialog from "$lib/components/ui/dialog";
  import { useApi, useAccounts } from "$lib/context";
  import { errorMessage } from "$lib/api";
  import type { Account } from "$lib/types";
  import Field from "../components/Field.svelte";
  import SelectField from "../components/SelectField.svelte";
  import Notice from "../components/Notice.svelte";
  import Loading from "../components/Loading.svelte";
  import Failure from "../components/Failure.svelte";
  import Empty from "../components/Empty.svelte";
  const query = useAccounts();
  const api = useApi();
  const cache = useQueryClient();
  let search = $state("");
  let editing = $state<Partial<Account> | null>(null);
  let open = $derived(editing !== null);
  const save = createMutation(() => ({
    mutationFn: () => api.saveAccount(editing?.id ?? null, editing!),
    onSuccess: async () => {
      editing = null;
      await cache.invalidateQueries();
    },
  }));
  let accounts = $derived(
    query.data?.filter((a) =>
      `${a.type}${a.subtype}${a.name}`.includes(search),
    ) || [],
  );
  function edit(account: Partial<Account>) {
    save.reset();
    editing = { ...account };
  }
  const types = ["资产", "负债", "净资产", "收入", "支出"].map((value) => ({
    value,
    label: value,
  }));
</script>

<div class="page">
  <div class="page-heading pr-12">
    <div class="flex items-center gap-2">
      <Button href="/settings" variant="ghost" size="icon" aria-label="返回设置"
        ><ArrowLeft aria-hidden="true" /></Button
      >
      <h1>科目设置</h1>
    </div>
    <Button
      onclick={() => edit({ type: "资产", name: "", subtype: "", notes: "" })}
      ><Plus aria-hidden="true" />新增科目</Button
    >
  </div>
  <Field label="搜索科目" type="search" bind:value={search} />
  {#if query.isPending}<Loading />{:else if query.error}<Failure
      error={query.error}
      retry={() => query.refetch()}
    />{:else if accounts.length === 0}<Empty title="没有匹配的科目" />{:else}
    <div class="space-y-3">
      {#each accounts as account (account.id)}<button
          class="flex w-full items-center justify-between gap-4 rounded-xl border bg-card p-5 text-left transition-colors hover:bg-muted"
          onclick={() => edit(account)}
          ><span
            ><span class="block font-medium">{account.name}</span><span
              class="text-sm text-muted-foreground"
              >{account.type} / {account.subtype}</span
            ></span
          >{#if account.type === "资产" && account.subtype === "现金及等价物"}<Badge
              variant="outline">现金范围</Badge
            >{/if}</button
        >{/each}
    </div>
  {/if}
</div>
<Dialog.Root
  {open}
  onOpenChange={(v) => {
    if (!v && !save.isPending) editing = null;
  }}
>
  <Dialog.Content
    showCloseButton={false}
    class="max-h-[90dvh] overflow-y-auto"
    onEscapeKeydown={(e) => {
      if (save.isPending) e.preventDefault();
    }}
    onInteractOutside={(e) => {
      if (save.isPending) e.preventDefault();
    }}
  >
    <Dialog.Header
      ><Dialog.Title>{editing?.id ? "编辑科目" : "新增科目"}</Dialog.Title
      ><Dialog.Description class="sr-only">科目</Dialog.Description
      ></Dialog.Header
    >
    {#if editing}<form
        class="space-y-5"
        onsubmit={(e) => {
          e.preventDefault();
          if (!save.isPending) save.mutate();
        }}
      >
        {#if save.error}<Notice variant="error"
            >{errorMessage(save.error)}</Notice
          >{/if}
        <fieldset disabled={save.isPending} class="min-w-0 space-y-4">
          <Field
            label="科目名称"
            value={editing.name || ""}
            oninput={(e) => {
              if (editing) editing.name = e.currentTarget.value;
            }}
            required
          /><SelectField
            label="类型"
            value={editing.type || "资产"}
            options={types}
            disabled={save.isPending}
            onchange={(v) => {
              if (editing) editing.type = v as Account["type"];
            }}
          /><Field
            label="子类"
            value={editing.subtype || ""}
            oninput={(e) => {
              if (editing) editing.subtype = e.currentTarget.value;
            }}
          /><Field
            label="说明"
            value={editing.notes || ""}
            oninput={(e) => {
              if (editing) editing.notes = e.currentTarget.value;
            }}
          />
        </fieldset>
        <Dialog.Footer
          ><Button
            variant="outline"
            disabled={save.isPending}
            onclick={() => (editing = null)}>取消</Button
          ><Button type="submit" disabled={save.isPending}
            >{save.isPending ? "正在保存…" : "保存科目"}</Button
          ></Dialog.Footer
        >
      </form>{/if}
  </Dialog.Content>
</Dialog.Root>
