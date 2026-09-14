import { expect, it } from "vitest";
import { transactionCategory, transactionMoney } from "./presentation";
import { simpleEntrySlots } from "./editor";
import { accounts, transaction } from "../test/fixtures";

it("formats SQL transaction kinds with signed amounts without implying transfer income", () => {
  expect(transactionMoney(transaction)).toBe("− ¥100.00");
  expect(transactionMoney({ ...transaction, kind: "income" })).toBe(
    "+ ¥100.00",
  );
  expect(transactionMoney({ ...transaction, kind: "refund" })).toBe(
    "+ ¥100.00",
  );
  expect(transactionMoney({ ...transaction, kind: "transfer" })).toBe(
    "¥100.00",
  );
  expect(transactionMoney({ ...transaction, amount: null })).toBe("待补录");
  expect(transactionMoney(transaction, true)).toBe("••••");
});
it("uses actual categorized accounts without guessing merchant classifications", () => {
  expect(transactionCategory(transaction, accounts)).toBe("餐饮");
  expect(transactionCategory({ entries: [] }, accounts)).toBe("");
});
it("keeps reversed refunds, transfers and unbalanced records out of the simple editor", () => {
  expect(simpleEntrySlots(transaction, accounts)).toEqual({
    type: "支出",
    category: 0,
    account: 1,
  });
  expect(
    simpleEntrySlots(
      {
        ...transaction,
        entries: transaction.entries.map((e) => ({
          ...e,
          direction: e.direction === "借" ? "贷" : "借",
        })),
      },
      accounts,
    ),
  ).toBeNull();
  expect(
    simpleEntrySlots(
      {
        ...transaction,
        entries: transaction.entries.map((e) => ({ ...e, account_id: 2 })),
      },
      accounts,
    ),
  ).toBeNull();
  expect(
    simpleEntrySlots(
      {
        ...transaction,
        entries: [
          { ...transaction.entries[0], amount: "1.00" },
          transaction.entries[1],
        ],
      },
      accounts,
    ),
  ).toBeNull();
});
