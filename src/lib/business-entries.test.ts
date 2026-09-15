import { expect, it } from "vitest";
import {
  businessLayout,
  allocateRemainder,
  roleAccounts,
} from "./business-entries";
import { accounts, transaction } from "../test/fixtures";
import type { Account } from "./types";
const all: Account[] = [
  ...accounts,
  { id: 3, type: "收入", subtype: "工资", name: "月薪", notes: null },
];
it("recognizes balanced multi-class expenses and transfers without changing entries", () => {
  const split = {
    ...transaction,
    entries: [
      { ...transaction.entries[0], amount: "40" },
      { ...transaction.entries[1], amount: "100" },
      { ...transaction.entries[0], id: 13, amount: "60" },
    ],
  };
  const before = JSON.stringify(split);
  expect(businessLayout(split, all)).toEqual({
    type: "支出",
    roles: ["category", "account", "category"],
  });
  expect(JSON.stringify(split)).toBe(before);
  expect(
    businessLayout(
      {
        ...transaction,
        entries: [
          { ...transaction.entries[0], account_id: 2 },
          transaction.entries[1],
        ],
      },
      all,
    ),
  ).toEqual({ type: "转账", roles: ["to", "from"] });
});
it("keeps refunds, reversed income and unbalanced history in full-entry mode", () => {
  expect(businessLayout({ ...transaction, status: "refund" }, all)).toBeNull();
  expect(
    businessLayout(
      {
        ...transaction,
        entries: [
          { ...transaction.entries[0], account_id: 3 },
          transaction.entries[1],
        ],
      },
      all,
    ),
  ).toBeNull();
  expect(
    businessLayout(
      {
        ...transaction,
        entries: [
          ...transaction.entries,
          { account_id: 1, direction: "借", amount: "1" },
        ],
      },
      all,
    ),
  ).toBeNull();
});
it("allocates exact decimal remainder without rewriting split destinations or IDs", () => {
  const entries = [
    { id: 1, account_id: 3, direction: "贷" as const, amount: "100.10" },
    { id: 2, account_id: 2, direction: "借" as const, amount: "100.10" },
    { id: 3, account_id: 1, direction: "借" as const, amount: "0.20" },
  ];
  allocateRemainder(entries, {
    type: "收入",
    roles: ["category", "account", "deduction"],
  });
  expect(entries[1]).toEqual({
    id: 2,
    account_id: 2,
    direction: "借",
    amount: "99.90",
  });
  expect(roleAccounts("收入", "category", all).map((a) => a.id)).toEqual([3]);
  expect(roleAccounts("收入", "deduction", all).map((a) => a.id)).toEqual([1]);
});
it("leaves zero-entry history unmodified until an explicit edit", () => {
  const empty = { ...transaction, entries: [] };
  expect(businessLayout(empty, all)).toBeNull();
  expect(empty.entries).toEqual([]);
});
