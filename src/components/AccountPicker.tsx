import { Autocomplete, TextField } from "@mui/material";
import type { Account } from "../lib/types";
export default function AccountPicker({
  accounts,
  value,
  onChange,
  label = "会计科目",
  autoFocus = false,
}: {
  accounts: Account[];
  value: number | null;
  onChange: (id: number | null) => void;
  label?: string;
  autoFocus?: boolean;
}) {
  return (
    <Autocomplete
      options={accounts}
      groupBy={(a) => a.type}

      getOptionLabel={(a) =>
        `${a.subtype} / ${a.name}${a.notes ? " · " + a.notes : ""}`
      }
      isOptionEqualToValue={(a, b) => a.id === b.id}
      value={accounts.find((a) => a.id === value) || null}
      onChange={(_, a) => onChange(a?.id ?? null)}
      noOptionsText="未找到科目，请到科目设置新增"
      renderInput={(p) => (
        <TextField {...p} label={label} autoFocus={autoFocus} />
      )}
    />
  );
}
