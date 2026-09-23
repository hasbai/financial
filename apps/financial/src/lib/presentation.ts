import type { Account, Transaction } from "./types";
import { money } from "./finance";

// The database supplies kind and unsigned amount; this is display formatting only.
export function transactionMoney(
  t: Pick<Transaction, "kind" | "amount">,
  hidden = false,
) {
  if (hidden) return "••••";
  if (t.amount === null) return "待补录";
  const sign =
    t.kind === "expense"
      ? "− "
      : ["income", "refund"].includes(t.kind)
        ? "+ "
        : "";
  return sign + money(t.amount);
}
export function transactionCategory(
  t: Pick<Transaction, "entries">,
  accounts: Account[],
) {
  const categories = t.entries
    .map((e) => accounts.find((a) => a.id === e.account_id))
    .filter((a) => a && ["收入", "支出"].includes(a.type));
  return [...new Set(categories.map((a) => a!.subtype || a!.name))].join(" / ");
}
