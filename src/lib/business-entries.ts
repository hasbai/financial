import Decimal from "decimal.js";
import { simpleEntrySlots } from "./editor";
import { totals } from "./finance";
import type { Account, Entry, Payload } from "./types";
export type BusinessType = "收入" | "支出" | "转账";
export type EntryRole = "category" | "account" | "deduction" | "from" | "to";
export type BusinessLayout = { type: BusinessType; roles: EntryRole[] };
export function businessLayout(
  values: Payload,
  accounts: Account[],
): BusinessLayout | null {
  if (
    !values.entries.length ||
    ["refund", "partial_refund"].includes(values.status)
  )
    return null;
  const simple = simpleEntrySlots(values, accounts);
  if (simple)
    return {
      type: simple.type,
      roles: values.entries.map((_, i) =>
        i === simple.category ? "category" : "account",
      ),
    };
  const entries = values.entries;
  if (entries.length < 2 || entries.some((e) => e.account_id === null))
    return null;
  const sum = totals(entries);
  if (!sum.借.eq(sum.贷)) return null;
  const types = entries.map(
    (e) => accounts.find((a) => a.id === e.account_id)?.type,
  );
  if (types.some((t) => !t || t === "净资产")) return null;
  if (types.every((t) => t === "资产" || t === "负债")) {
    return {
      type: "转账",
      roles: entries.map((e) => (e.direction === "贷" ? "from" : "to")),
    };
  }
  const type = types.includes("收入") ? "收入" : "支出";
  const roles: EntryRole[] = [];
  for (let i = 0; i < entries.length; i++) {
    const t = types[i],
      direction = entries[i].direction;
    if (t === type && direction === (type === "收入" ? "贷" : "借"))
      roles.push("category");
    else if (type === "收入" && t === "支出" && direction === "借")
      roles.push("deduction");
    else if (
      (t === "资产" || t === "负债") &&
      direction === (type === "收入" ? "借" : "贷")
    )
      roles.push("account");
    else return null;
  }
  return roles.includes("category") && roles.includes("account")
    ? { type, roles }
    : null;
}
export function roleDirection(
  type: BusinessType,
  role: EntryRole,
): Entry["direction"] {
  if (role === "from") return "贷";
  if (role === "to" || role === "deduction") return "借";
  return (role === "category") === (type === "支出") ? "借" : "贷";
}
export function roleAccounts(
  type: BusinessType,
  role: EntryRole,
  accounts: Account[],
) {
  return accounts.filter((a) =>
    role === "category"
      ? a.type === type
      : role === "deduction"
        ? a.type === "支出"
        : ["资产", "负债"].includes(a.type),
  );
}
export function roleTotal(
  entries: Entry[],
  roles: EntryRole[],
  role: EntryRole,
) {
  return entries.reduce(
    (sum, e, i) =>
      roles[i] === role && /^\d+(\.\d*)?$/.test(e.amount)
        ? sum.plus(e.amount)
        : sum,
    new Decimal(0),
  );
}
// Only an explicit edit allocates the sole destination. Reading old entries never rewrites them.
export function allocateRemainder(entries: Entry[], layout: BusinessLayout) {
  const destination = layout.type === "转账" ? "to" : "account";
  const indexes = layout.roles.flatMap((r, i) =>
    r === destination ? [i] : [],
  );
  if (indexes.length !== 1) return;
  const source = layout.type === "转账" ? "from" : "category";
  if (
    entries.some(
      (e, i) =>
        layout.roles[i] !== destination &&
        !/^\d{1,10}(\.\d{1,2})?$/.test(e.amount),
    )
  )
    return;
  const amount = roleTotal(entries, layout.roles, source).minus(
    roleTotal(entries, layout.roles, "deduction"),
  );
  entries[indexes[0]].amount = amount.gt(0) ? amount.toFixed(2) : "";
}
