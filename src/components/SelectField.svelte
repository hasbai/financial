<script lang="ts">
  import * as Select from "$lib/components/ui/select";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { MediaQuery } from "svelte/reactivity";
  import { Check, ChevronDown } from "@lucide/svelte";
  let {
    label,
    value = $bindable(""),
    options,
    onchange,
    disabled = false,
  }: {
    label: string;
    value?: string;
    options: { value: string; label: string }[];
    onchange?: (value: string) => void;
    disabled?: boolean;
  } = $props();
  const id = $props.id();
  const desktop = new MediaQuery("(min-width: 640px)");
  let open = $state(false);
  // Bits UI reserves the empty value for no selection; a sentinel represents "all".
  let selected = $derived(value || "__all__");
</script>

<div class="min-w-0 space-y-2">
  <Label for={id}>{label}</Label>
  {#if !desktop.current}
    <Dialog.Root bind:open>
      <Dialog.Trigger {id} {disabled}>
        {#snippet child({ props })}
          <Button
            {...props}
            {disabled}
            variant="outline"
            role="combobox"
            aria-haspopup="dialog"
            aria-expanded={open}
            class="h-auto min-h-12 w-full justify-between whitespace-normal text-left"
          >
            <span class="min-w-0 break-words"
              >{options.find((o) => o.value === value)?.label ?? "请选择"}</span
            ><ChevronDown class="size-4 shrink-0" aria-hidden="true" />
          </Button>
        {/snippet}
      </Dialog.Trigger>
      <Dialog.Content
        class="gap-3"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(id)?.focus({ preventScroll: true });
        }}
      >
        <Dialog.Header
          ><Dialog.Title>选择{label}</Dialog.Title><Dialog.Description
            class="sr-only">{label}</Dialog.Description
          ></Dialog.Header
        >
        <div class="space-y-1">
          {#each options as item}
            <Button
              variant="ghost"
              class="h-auto min-h-12 w-full justify-between whitespace-normal text-left"
              aria-pressed={value === item.value}
              onclick={() => {
                value = item.value;
                onchange?.(value);
                open = false;
              }}
              ><span class="min-w-0 break-words">{item.label}</span
              >{#if value === item.value}<Check
                  class="size-4 shrink-0"
                  aria-hidden="true"
                />{/if}</Button
            >
          {/each}
        </div>
      </Dialog.Content>
    </Dialog.Root>
  {:else}
    <Select.Root
      type="single"
      {disabled}
      value={selected}
      onValueChange={(v) => {
        value = v === "__all__" ? "" : v;
        onchange?.(value);
      }}
    >
      <Select.Trigger {id} class="w-full"
        >{options.find((o) => o.value === value)?.label ??
          "请选择"}</Select.Trigger
      >
      <Select.Content
        >{#each options as item}<Select.Item
            value={item.value || "__all__"}
            label={item.label}>{item.label}</Select.Item
          >{/each}</Select.Content
      >
    </Select.Root>
  {/if}
</div>
