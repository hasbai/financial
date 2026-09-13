<script lang="ts">
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import type { HTMLInputAttributes } from "svelte/elements";
  let {
    label,
    value = $bindable(""),
    ...rest
  }: Omit<HTMLInputAttributes, "value" | "type" | "files"> & {
    label: string;
    value?: string;
    type?: "text" | "date" | "month" | "datetime-local" | "search";
  } = $props();
  const id = $props.id();
</script>

<div class="min-w-0 space-y-2">
  <Label for={id}>{label}</Label><Input {id} bind:value {...rest} />
</div>
