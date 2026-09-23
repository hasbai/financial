<script lang="ts">
  import { tick } from "svelte";
  import AccountCreateForm from "./AccountCreateForm.svelte";
  import * as Dialog from "@hasbai/ui/dialog";
  import * as Command from "@hasbai/ui/command";
  import { Button } from "@hasbai/ui/button";
  import { Label } from "@hasbai/ui/label";
  import { ArrowLeft, Check, ChevronRight, Plus, X } from "@lucide/svelte";
  import type { Account, AccountType } from "$lib/types";
  let {
    accounts,
    createTypes,
    createNoun = "账户",
    value = $bindable(null),
    onChange,
    label = "会计科目",
    disabled = false,
    compact = false,
    placeholder = "选择科目",
  }: {
    accounts: Account[];
    createTypes?: readonly AccountType[];
    createNoun?: string;
    value?: number | null;
    onChange?: (id: number | null) => void;
    label?: string;
    disabled?: boolean;
    compact?: boolean;
    placeholder?: string;
  } = $props();
  let open = $state(false);
  let creating = $state(false);
  let busy = $state(false);
  let initial = $state<Partial<Account>>({});
  let panel: HTMLDivElement | null = $state(null);
  let createButton: HTMLButtonElement | null = $state(null);
  async function beginCreate() {
    const context = orderedAccounts.find((a) => key(a) === group);
    initial = {
      type: context?.type ?? createTypes![0],
      subtype: context?.subtype ?? "",
      name: search.trim(),
      notes: "",
    };
    creating = true;
    await tick();
    panel?.focus({ preventScroll: true });
  }
  async function cancelCreate() {
    creating = false;
    await tick();
    createButton?.focus({ preventScroll: true });
  }
  let group = $state("");
  let search = $state("");
  const id = $props.id();
  const key = (a: Account) => JSON.stringify([a.type, a.subtype]);
  let orderedAccounts = $derived([...accounts].sort((a, b) => a.id - b.id));
  let chosen = $derived(orderedAccounts.find((a) => a.id === value));
  let multipleTypes = $derived(
    new Set(orderedAccounts.map((a) => a.type)).size > 1,
  );
  let groups = $derived([
    ...new Map(
      orderedAccounts.map((a) => [
        key(a),
        {
          key: key(a),
          label: multipleTypes ? `${a.type} · ${a.subtype}` : a.subtype,
        },
      ]),
    ).values(),
  ]);
  let visible = $derived(
    orderedAccounts.filter((a) =>
      search.trim()
        ? `${a.id} ${a.type} ${a.subtype} ${a.name} ${a.notes ?? ""}`
            .toLocaleLowerCase()
            .includes(search.trim().toLocaleLowerCase())
        : key(a) === group,
    ),
  );
  function choose(next: number | null) {
    value = next;
    onChange?.(next);
    open = false;
  }
</script>

<div class={compact ? "min-w-0" : "min-w-0 space-y-2"}>
  <Label for={id} class={compact ? "sr-only" : ""}>{label}</Label>
  <div class="flex min-w-0 gap-1">
    <Dialog.Root
      {open}
      onOpenChange={(v) => {
        if (busy) return;
        open = v;
        if (v) {
          creating = false;
          search = "";
          group = chosen ? key(chosen) : "";
        }
      }}
    >
      <Dialog.Trigger {id} {disabled}>
        {#snippet child({ props })}<Button
            {...props}
            {disabled}
            role="combobox"
            aria-haspopup="dialog"
            aria-expanded={open}
            variant="outline"
            class={[
              "h-auto min-h-12 min-w-0 flex-1 justify-between whitespace-normal text-left",
              compact && "rounded-xl border-transparent bg-transparent px-3",
              compact && !chosen && "border-profit/40 bg-profit/5 text-profit",
            ]}
            ><span class="min-w-0 break-words"
              >{chosen
                ? compact
                  ? chosen.name
                  : `${chosen.type} / ${chosen.subtype} / ${chosen.name}`
                : placeholder}</span
            ><ChevronRight class="size-4 shrink-0" aria-hidden="true" /></Button
          >{/snippet}
      </Dialog.Trigger>
      <Dialog.Content
        bind:ref={panel}
        onEscapeKeydown={(event) => {
          if (busy || creating) event.preventDefault();
          if (creating && !busy) void cancelCreate();
        }}
        onInteractOutside={(event) => {
          if (busy || creating) event.preventDefault();
        }}
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(id)?.focus({ preventScroll: true });
        }}
        class="mobile-panel form-sheet flex h-[min(600px,85dvh)] flex-col gap-0 p-0 sm:max-w-md sm:rounded-3xl"
      >
        <Dialog.Header
          class="mobile-panel-header flex-row items-center gap-2 border-b px-4 py-3 text-left"
        >
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label={creating
              ? `返回${createNoun}列表`
              : group || search
                ? "返回大类"
                : `关闭${label}选择`}
            onclick={() => {
              if (creating) {
                void cancelCreate();
              } else if (group || search) {
                group = "";
                search = "";
              } else open = false;
            }}><ArrowLeft aria-hidden="true" /></Button
          >
          <Dialog.Title class="min-w-0 flex-1 break-words"
            >{creating
              ? `新增${createNoun}`
              : search
                ? label
                : groups.find((g) => g.key === group)?.label ||
                  `选择${label}`}</Dialog.Title
          >
          <Dialog.Description class="sr-only">{label}</Dialog.Description>
          <Button
            variant="ghost"
            size="icon"
            aria-label={creating ? `取消新增${createNoun}` : `关闭${label}选择`}
            disabled={busy}
            onclick={() => (creating ? cancelCreate() : (open = false))}
            ><X aria-hidden="true" /></Button
          >
        </Dialog.Header>
        {#if creating && createTypes}
          <AccountCreateForm
            {initial}
            types={createTypes}
            noun={createNoun}
            bind:busy
            oncreated={(account) => choose(account.id)}
            oncancel={cancelCreate}
          />
        {:else}
          <Command.Root
            shouldFilter={false}
            class="min-h-0 flex-1 rounded-none p-0"
            label={`搜索${label}`}
          >
            <Command.Input
              bind:value={search}
              aria-label={`搜索${label}`}
              placeholder={`搜索${label}`}
              class="text-base"
            />
            <Command.List
              class="max-h-none min-h-0 flex-1 overscroll-contain p-3 pb-[max(16px,env(safe-area-inset-bottom))]"
            >
              <Command.Empty>无匹配科目</Command.Empty>
              {#if !group && !search.trim()}
                {#each groups as item}<Command.Item
                    value={item.key}
                    onSelect={() => (group = item.key)}
                    class="min-h-14 gap-3 whitespace-normal"
                    ><span class="min-w-0 flex-1 break-words">{item.label}</span
                    ><span class="text-muted-foreground"
                      >{orderedAccounts.filter((a) => key(a) === item.key)
                        .length}</span
                    ><ChevronRight
                      class="size-4"
                      aria-hidden="true"
                    /></Command.Item
                  >{/each}
              {:else}
                {#each visible as account}<Command.Item
                    value={String(account.id)}
                    onSelect={() => choose(account.id)}
                    class="min-h-14 gap-3 whitespace-normal"
                    ><span class="min-w-0 flex-1 break-words"
                      >{search.trim()
                        ? `${account.subtype} / ${account.name}`
                        : account.name}</span
                    >{#if value === account.id}<Check
                        class="size-5 shrink-0"
                        aria-hidden="true"
                      />{/if}</Command.Item
                  >{/each}
              {/if}
            </Command.List>
          </Command.Root>
          {#if createTypes?.length}
            <div
              class="shrink-0 border-t px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]"
            >
              <Button
                bind:ref={createButton}
                variant="outline"
                class="w-full rounded-xl"
                onclick={beginCreate}
                ><Plus aria-hidden="true" />新增{createNoun}</Button
              >
            </div>
          {/if}
        {/if}
      </Dialog.Content>
    </Dialog.Root>
    {#if value !== null}<Button
        {disabled}
        variant="ghost"
        size="icon"
        aria-label={`清除${label}`}
        onclick={() => choose(null)}><X aria-hidden="true" /></Button
      >{/if}
  </div>
</div>
