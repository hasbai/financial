import Decimal from "decimal.js";
import { z } from "zod";
import type { Entry, Payload } from "./types";
export const amountSchema = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "金额最多两位小数")
  .refine(
    (v) => /^\d{1,10}(\.\d{1,2})?$/.test(v) && new Decimal(v).gt(0),
    "金额必须大于零",
  );
export function totals(entries: Entry[]) {
  return entries.reduce(
    (s, e) => {
      if (/^\d+(\.\d*)?$/.test(e.amount))
        s[e.direction] = s[e.direction].plus(e.amount);
      return s;
    },
    { 借: new Decimal(0), 贷: new Decimal(0) },
  );
}
export function validatePost(p: Payload): string[] {
  const errors: string[] = [];
  if (!p.occurred_at || !Number.isFinite(Date.parse(p.occurred_at)))
    errors.push("请选择有效日期");
  if (
    !["success", "pending", "cancel", "refund", "partial_refund"].includes(
      p.status,
    )
  )
    errors.push("当前交易状态不允许入账");
  if (p.entries.length > 0 && p.entries.length < 2)
    errors.push("至少需要两条分录");
  p.entries.forEach((e, i) => {
    if (!amountSchema.safeParse(e.amount).success)
      errors.push(`分录 ${i + 1}：请输入正数金额，最多两位小数`);
  });
  const s = totals(p.entries);
  if (!s["借"].eq(s["贷"])) errors.push("借贷不平衡，请检查分录");
  return errors;
}
export function money(value: string | null | undefined, hidden = false) {
  if (hidden) return "••••";
  if (value == null) return "待补录";
  const d = new Decimal(value);
  return `${d.isNegative() ? "−" : ""}¥${d
    .abs()
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1, -8)).toISOString(),
    end: new Date(Date.UTC(y, m, 1, -8)).toISOString(),
  };
}
export function currentMonth() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}
export function localDateTime(iso: string) {
  return new Date(new Date(iso).getTime() + 8 * 3600000)
    .toISOString()
    .slice(0, 16);
}
export function fromLocalDateTime(v: string) {
  return v ? new Date(v + ":00+08:00").toISOString() : "";
}
export function safeReturnPath(value: unknown) {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.startsWith("/auth/")
    ? value
    : "/";
}
export const statusLabels: Record<string, string> = {
  success: "交易成功",
  pending: "处理中",
  cancel: "已取消",
  refund: "已退款",
  partial_refund: "部分退款",
};
export const kindLabels: Record<string, string> = {
  expense: "支出",
  income: "收入",
  transfer: "转账",
  refund: "退款",
};
export const categoryLabels: Record<string, string> = {
  living: "生活",
  investing: "投资",
  financing: "筹资",
};
