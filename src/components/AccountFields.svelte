<script lang="ts">
  import type { Account, AccountType } from "$lib/types";
  import { accountTypes } from "$lib/accounts";
  import Field from "./Field.svelte";
  import SelectField from "./SelectField.svelte";
  let {
    id = $bindable(""),
    account = $bindable(),
    types = accountTypes,
    noun = "科目",
    disabled = false,
  }: {
    id?: string;
    account: Partial<Account>;
    types?: readonly AccountType[];
    noun?: string;
    disabled?: boolean;
  } = $props();
</script>

<Field
  label={`${noun} ID`}
  bind:value={id}
  inputmode="numeric"
  maxlength={5}
  pattern={"[1-5][0-9]{4}"}
  required
/>
<Field
  label={`${noun}名称`}
  value={account.name || ""}
  oninput={(e) => (account.name = e.currentTarget.value)}
  required
/>
<SelectField
  label="类型"
  value={account.type || types[0]}
  options={types.map((value) => ({ value, label: value }))}
  {disabled}
  onchange={(v) => (account.type = v as AccountType)}
/>
<Field
  label="子类"
  value={account.subtype || ""}
  oninput={(e) => (account.subtype = e.currentTarget.value)}
  required
/>
<Field
  label="说明"
  value={account.notes || ""}
  oninput={(e) => (account.notes = e.currentTarget.value)}
/>
