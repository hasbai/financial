<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Command from "$lib/components/ui/command";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { ArrowLeft, Check, ChevronRight, X } from "@lucide/svelte";
  import type { Account } from "$lib/types";
  let {
    accounts,
    value = $bindable(null),
    onChange,
    label = "会计科目",
    disabled = false,
    compact = false,
    placeholder = "选择科目",
  }: {
    accounts: Account[];
    value?: number | null;
    onChange?: (id: number | null) => void;
    label?: string;
    disabled?: boolean;
    compact?: boolean;
    placeholder?: string;
  } = $props();
  let open = $state(false);
  let group = $state("");
  let search = $state("");
  const id = $props.id();
  const key = (a: Account) => JSON.stringify([a.type, a.subtype]);
  let chosen = $derived(accounts.find((a) => a.id === value));
  let multipleTypes = $derived(new Set(accounts.map((a) => a.type)).size > 1);
  let groups = $derived([
    ...new Map(
      accounts.map((a) => [
        key(a),
        {
          key: key(a),
          label: multipleTypes ? `${a.type} · ${a.subtype}` : a.subtype,
        },
      ]),
    ).values(),
  ]);
  let visible = $derived(
    accounts.filter((a) =>
      search.trim()
        ? `${a.type} ${a.subtype} ${a.name} ${a.notes ?? ""}`
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
      bind:open
      onOpenChange={(v) => {
        if (v) {
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
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(id)?.focus({ preventScroll: true });
        }}
        class="mobile-panel flex h-[min(600px,85dvh)] flex-col gap-0 p-0 sm:max-w-md sm:rounded-3xl"
      >
        <Dialog.Header
          class="mobile-panel-header flex-row items-center gap-2 border-b px-4 py-3 text-left"
        >
          <Button
            variant="ghost"
            size="icon"
            aria-label={group || search ? "返回大类" : `关闭${label}选择`}
            onclick={() => {
              if (group || search) {
                group = "";
                search = "";
              } else open = false;
            }}><ArrowLeft aria-hidden="true" /></Button
          >
          <Dialog.Title class="min-w-0 flex-1 break-words"
            >{search
              ? label
              : groups.find((g) => g.key === group)?.label ||
                `选择${label}`}</Dialog.Title
          >
          <Dialog.Description class="sr-only">{label}</Dialog.Description>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`关闭${label}选择`}
            onclick={() => (open = false)}><X aria-hidden="true" /></Button
          >
        </Dialog.Header>
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
                    >{accounts.filter((a) => key(a) === item.key).length}</span
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
