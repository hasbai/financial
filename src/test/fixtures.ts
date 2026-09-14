import type { Account, Transaction, Overview } from "../lib/types";
export const accounts: Account[] = [
  { id: 1, type: "支出", subtype: "餐饮", name: "餐饮", notes: null },
  { id: 2, type: "资产", subtype: "现金及等价物", name: "银行卡", notes: null },
];
export const transaction: Transaction = {
  id: 7,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  occurred_at: "2026-09-01T00:00:00Z",
  status: "success",
  payment_method: "direct",
  payment_id: "",
  merchant: "示例消费",
  notes: "",
  complete: true,
  kind: "expense",
  entry_count: 2,
  missing_accounts: 0,
  amount: "100.00",
  entries: [
    { id: 11, account_id: 1, direction: "借", amount: "100.00" },
    { id: 12, account_id: 2, direction: "贷", amount: "100.00" },
  ],
};
export const overview: Overview = {
  as_of: "2026-09-13T00:00:00Z",
  assets: "1000.00",
  liabilities: "100.00",
  net_assets: "900.00",
  income: "200.00",
  expense: "30.00",
  profit: "170.00",
  cash_in: "200.00",
  cash_out: "30.00",
  cash_net: "170.00",
  cash_opening: "830.00",
  cash_closing: "1000.00",
  accounts: [
    {
      id: 2,
      name: "银行卡",
      type: "资产",
      subtype: "现金及等价物",
      balance: "1000.00",
    },
  ],
  categories: [{ name: "餐饮", type: "支出", amount: "30.00" }],
  cash_categories: [{ name: "living", inflow: "200.00", outflow: "30.00" }],
  trend: [{ date: "2026-09-01", income: "200.00", expense: "30.00" }],
  quality: {
    pending: 2,
    period_pending: 1,
    missing_entries: 1,
    missing_accounts: 1,
    posted: 3,
    coverage_start: "2026-01-01",
    generated_at: "2026-09-13T00:00:00Z",
  },
};

export const reportParts = {
  balanceHistory: [
    {
      date: "2026-09-01",
      assets: "1000.00",
      liabilities: "100.00",
      net_assets: "900.00",
    },
  ],
  cashDaily: [{ date: "2026-09-01", inflow: "200.00", outflow: "30.00" }],
  balance: overview,
  accounts: overview.accounts,
  income: overview,
  categories: overview.categories,
  trend: overview.trend,
  cash: overview,
  cashCategories: overview.cash_categories,
  opening: overview,
  quality: overview.quality,
  periodQuality: { pending: overview.quality.period_pending },
};

export function homeSnapshot(): import("../lib/types").HomeSnapshot {
  const as_of = new Date().toISOString();
  return {
    ...overview,
    as_of,
    start: new Date(
      new Date().toLocaleDateString("sv-SE", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
      }) + "-01T00:00:00+08:00",
    ).toISOString(),
    future_end: new Date(Date.parse(as_of) + 30 * 86400000).toISOString(),
    pending: overview.quality.pending,
    cash_configured: true,
    cash: overview,
    balance_trend: ["100", "200", "300", "400", "500", overview.net_assets],
    cash_bars: [
      {
        start: as_of,
        end: new Date(Date.parse(as_of) + 30 * 86400000).toISOString(),
        inflow: overview.cash_in,
        outflow: overview.cash_out,
      },
    ],
    recent: [{ ...transaction, category: "餐饮" }],
  };
}
