export type AccountType = "资产" | "负债" | "净资产" | "收入" | "支出";
export type Account = {
  id: number;
  type: AccountType;
  subtype: string;
  name: string;
  notes: string | null;
};
export type Entry = {
  id?: number;
  account_id: number | null;
  direction: "借" | "贷";
  amount: string;
};
export type Payload = {
  occurred_at: string;
  status: string;
  payment_method: string;
  payment_id: string;
  merchant: string;
  notes: string;
  entries: Entry[];
};
export type Transaction = Payload & {
  id: number;
  created_at: string;
  updated_at: string;
  complete: boolean;
  kind: "expense" | "income" | "refund" | "transfer";
  entry_count: number;
  missing_accounts: number;
  amount: string | null;
};
export type Overview = {
  as_of: string;
  assets: string;
  liabilities: string;
  net_assets: string;
  income: string;
  expense: string;
  profit: string;
  cash_in: string;
  cash_out: string;
  cash_net: string;
  cash_opening: string;
  cash_closing: string;
  accounts: {
    id: number;
    name: string;
    type: AccountType;
    subtype: string;
    balance: string;
  }[];
  categories: { name: string; type: AccountType; amount: string }[];
  cash_categories: { name: string; inflow: string; outflow: string }[];
  trend: { date: string; income: string; expense: string }[];
  quality: {
    pending: number;
    period_pending: number;
    missing_entries: number;
    missing_accounts: number;
    posted: number;
    coverage_start: string | null;
    generated_at: string;
  };
};
export type Cursor = { occurred_at: string; id: number } | null;
export type Page = { items: Transaction[]; next_cursor: Cursor };
export type Filters = Record<string, string>;
