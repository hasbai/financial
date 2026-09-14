<script lang="ts">
  import * as Popover from "$lib/components/ui/popover";
  import * as Command from "$lib/components/ui/command";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Check, ChevronsUpDown, X } from "@lucide/svelte";
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
  const id = $props.id();
  let chosen = $derived(accounts.find((a) => a.id === value));
  function choose(next: number | null) {
    value = next;
    onChange?.(next);
    open = false;
  }
</script>

<div class={compact ? "min-w-0" : "space-y-2"}>
  <Label for={id} class={compact ? "sr-only" : ""}>{label}</Label>
  <div class="flex gap-1">
    <Popover.Root bind:open>
      <Popover.Trigger {id} {disabled}>
        {#snippet child({ props })}<Button
            {...props}
            {disabled}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            class={[
              "h-auto min-h-12 w-full min-w-0 justify-between whitespace-normal text-left",
              compact && "rounded-xl border-transparent bg-transparent px-3",
              compact && !chosen && "border-profit/40 bg-profit/5 text-profit",
            ]}
            ><span class="min-w-0 break-words"
              >{chosen
                ? compact
                  ? chosen.name
                  : `${chosen.type} / ${chosen.subtype} / ${chosen.name}`
                : placeholder}</span
            ><ChevronsUpDown class="size-4" aria-hidden="true" /></Button
          >{/snippet}
      </Popover.Trigger>
      <Popover.Content
        class="w-[min(420px,calc(100vw-2rem))] p-0"
        align="start"
      >
        <Command.Root label="搜索会计科目">
          <Command.Input
            placeholder="搜索类型、子类、名称或说明…"
            aria-label="搜索会计科目"
          />
          <Command.List>
            <Command.Empty>无匹配科目</Command.Empty>
            {#each ["资产", "负债", "净资产", "收入", "支出"] as type}
              <Command.Group heading={type}>
                {#each accounts.filter((a) => a.type === type) as account}
                  <Command.Item
                    value={`${account.id} ${account.type} ${account.subtype} ${account.name} ${account.notes || ""}`}
                    onSelect={() => choose(account.id)}
                    class="min-h-11"
                  >
                    <Check
                      class={value === account.id
                        ? "size-4"
                        : "size-4 opacity-0"}
                      aria-hidden="true"
                    /><span
                      >{account.subtype} / {account.name}{account.notes
                        ? ` · ${account.notes}`
                        : ""}</span
                    >
                  </Command.Item>
                {/each}
              </Command.Group>
            {/each}
          </Command.List>
        </Command.Root>
      </Popover.Content>
    </Popover.Root>
    {#if value !== null}<Button
        {disabled}
        variant="ghost"
        size="icon"
        aria-label={`清除${label}`}
        onclick={() => choose(null)}><X aria-hidden="true" /></Button
      >{/if}
  </div>
</div>
