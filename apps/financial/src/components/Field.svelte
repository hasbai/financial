<script lang="ts">
  import { Input } from "@hasbai/ui/input";
  import { Label } from "@hasbai/ui/label";
  import type { HTMLInputAttributes } from "svelte/elements";
  let {
    label,
    value = $bindable(""),
    compact = false,
    ...rest
  }: Omit<HTMLInputAttributes, "value" | "type" | "files"> & {
    label: string;
    value?: string;
    type?: "text" | "date" | "month" | "datetime-local" | "search";
    compact?: boolean;
  } = $props();
  const id = $props.id();
</script>

<div class={compact ? "min-w-0" : "min-w-0 space-y-2"}>
  <Label for={id} class={compact ? "sr-only" : ""}>{label}</Label><Input
    {id}
    bind:value
    class={compact
      ? "rounded-xl border-transparent bg-transparent shadow-none"
      : ""}
    {...rest}
  />
</div>
