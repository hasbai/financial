<script lang="ts">
  import * as Select from "$lib/components/ui/select";
  import { Label } from "$lib/components/ui/label";
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
  // Bits UI reserves the empty value for no selection; a sentinel represents "all".
  let selected = $derived(value || "__all__");
</script>

<div class="min-w-0 space-y-2">
  <Label for={id}>{label}</Label>
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
</div>
