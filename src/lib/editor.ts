import Decimal from "decimal.js";
import { amountSchema } from "./finance";
import type { Account, Payload, Transaction } from "./types";

export function editorPayload(original: Transaction | null): Payload {
  return original
    ? {
        occurred_at: original.occurred_at,
        status: original.status,
        payment_method: original.payment_method,
        payment_id: original.payment_id || "",
        merchant: original.merchant || "",
        notes: original.notes || "",
        entries: original.entries.map((entry) => ({ ...entry })),
      }
    : {
        occurred_at: new Date().toISOString(),
        status: "success",
        payment_method: "direct",
        payment_id: "",
        merchant: "",
        notes: "",
        entries: [
          { account_id: null, direction: "借", amount: "" },
          { account_id: null, direction: "贷", amount: "" },
        ],
      };
}

// Prepare form input only. SQL remains authoritative for validation and posting.
export function appendRefund(
  values: Payload,
  accounts: Account[],
  refundAmount: string,
): Payload {
  if (!amountSchema.safeParse(refundAmount).success)
    throw new Error("退款金额必须为正数，最多两位小数");
  const balances = new Map<number, Decimal>();
  for (const entry of values.entries) {
    if (entry.account_id && amountSchema.safeParse(entry.amount).success)
      balances.set(
        entry.account_id,
        (balances.get(entry.account_id) || new Decimal(0)).plus(
          entry.direction === "借"
            ? entry.amount
            : new Decimal(entry.amount).negated(),
        ),
      );
  }
  const expense = [...balances].find(
    ([id, n]) => n.gt(0) && accounts.find((a) => a.id === id)?.type === "支出",
  );
  const payment = [...balances].find(
    ([id, n]) =>
      n.lt(0) &&
      ["资产", "负债"].includes(accounts.find((a) => a.id === id)?.type || ""),
  );
  if (!expense || !payment || balances.size !== 2)
    throw new Error(
      "这笔交易包含复杂分录，请在同一交易中手工增加退款借贷分录。",
    );
  const amount = new Decimal(refundAmount);
  if (amount.gt(expense[1]) || amount.gt(payment[1].abs()))
    throw new Error("退款金额不能超过当前净支出");
  return {
    ...values,
    status: amount.eq(expense[1]) ? "refund" : "partial_refund",
    entries: [
      ...values.entries,
      { direction: "借", account_id: payment[0], amount: amount.toFixed(2) },
      { direction: "贷", account_id: expense[0], amount: amount.toFixed(2) },
    ],
  };
}
