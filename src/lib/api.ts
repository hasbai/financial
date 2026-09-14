import {
  NeonPostgrestClient,
  fetchWithToken,
} from "@neondatabase/postgrest-js";

import Decimal from "decimal.js";
import { config } from "./config";
import type {
  Account,
  Transaction,
  Payload,
  Filters,
  Cursor,
  Page,
  Overview,
  HomeSnapshot,
} from "./types";
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function errorMessage(e: unknown) {
  const message = e instanceof Error ? e.message : "请求失败";
  if (message.includes("CONFLICT")) return "记录已更新";
  if (message.includes("IDEMPOTENCY_CONFLICT")) return "保存待核对";
  if (message.includes("FORBIDDEN") || message.includes("permission denied"))
    return "无操作权限";
  if (/login_required|consent_required|Missing Refresh Token/.test(message))
    return "登录已过期";
  return message.replace(/^VALIDATION: /, "");
}
export function createRepository(getToken: () => Promise<string>) {
  const db = new NeonPostgrestClient({
    dataApiUrl: config.dataApiUrl,
    options: {
      db: { schema: config.schema },
      global: { fetch: fetchWithToken(getToken) },
    },
  });
  async function rpc<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const { data, error } = await db.rpc(name, args);
    if (error) throw new ApiError(error.code, error.message);
    return data as T;
  }
  async function read<T>(
    query: PromiseLike<{
      data: unknown;
      error: { code: string; message: string } | null;
    }>,
  ): Promise<T> {
    const { data, error } = await query;
    if (error) throw new ApiError(error.code, error.message);
    return data as T;
  }
  async function allRows<T>(
    query: () => {
      range(
        from: number,
        to: number,
      ): PromiseLike<{
        data: unknown;
        error: { code: string; message: string } | null;
      }>;
    },
  ): Promise<T[]> {
    const result: T[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await read<T[]>(query().range(offset, offset + 999));
      result.push(...page);
      if (page.length < 1000) return result;
    }
  }
  function balanceRows(asOf: string, select: string) {
    // Midnight is a closing-day boundary. Intraday current queries use the latest MV.
    const date = new Date(Date.parse(asOf) + 8 * 3600000).toISOString();
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    if (date.slice(0, 10) >= today && date.slice(11, 23) !== "00:00:00.000")
      return db.from("balance_read").select(select);
    const closingDate = new Date(Date.parse(asOf) + 8 * 3600000 - 1)
      .toISOString()
      .slice(0, 10);
    return db
      .from("balance_history_read")
      .select(select)
      .eq("date", closingDate);
  }
  async function balanceTotals(asOf: string) {
    const row = await read<Record<string, string | null>>(
      balanceRows(
        asOf,
        sums("assets", "liabilities", "net_assets") +
          ",cash_closing:cash_balance::numeric.sum()::text",
      ).single(),
    );
    return {
      assets: row.assets ?? "0",
      liabilities: row.liabilities ?? "0",
      net_assets: row.net_assets ?? "0",
      cash_closing: row.cash_closing ?? "0",
    };
  }
  async function cashTotals(start: string, end: string, asOf: string) {
    const row = await read<{
      cash_in: string | null;
      cash_out: string | null;
      cash_net: string | null;
    }>(
      db
        .from("cashflow_read")
        .select(
          "cash_in:inflow::numeric.sum()::text,cash_out:outflow::numeric.sum()::text,cash_net:net::numeric.sum()::text",
        )
        .gte("occurred_at", start)
        .lt("occurred_at", effectiveEnd(end, asOf))
        .single(),
    );
    return {
      cash_in: row.cash_in ?? "0",
      cash_out: row.cash_out ?? "0",
      cash_net: row.cash_net ?? "0",
    };
  }
  function reportQueries(start: string, end: string, asOf: string) {
    const cutoff = effectiveEnd(end, asOf);
    const before = (view: string, select: string) =>
      db.from(view).select(select).lt("occurred_at", cutoff);
    const period = (view: string, select: string) =>
      before(view, select).gte("occurred_at", start);
    return {
      balance: () => balanceTotals(cutoff),
      accounts: () =>
        allRows<Overview["accounts"][number]>(() =>
          balanceRows(cutoff, "id,name,type,subtype,balance")
            .order("type")
            .order("subtype")
            .order("name")
            .order("id"),
        ),
      income: () =>
        read<Record<string, string | null>>(
          period(
            "income_statement",
            sums("income", "expense", "profit"),
          ).single(),
        ),
      categories: () =>
        allRows<Overview["categories"][number]>(() =>
          period("income_statement", "name:subtype,type," + sums("amount"))
            .in("type", ["收入", "支出"])
            .order("type")
            .order("subtype"),
        ),
      trend: () =>
        allRows<Overview["trend"][number]>(() =>
          period("income_statement", "date," + sums("income", "expense")).order(
            "date",
          ),
        ),
      cash: () => cashTotals(start, end, asOf),
      cashCategories: () =>
        allRows<Overview["cash_categories"][number]>(() =>
          period(
            "cashflow_read",
            "name:category," + sums("inflow", "outflow"),
          ).order("category"),
        ),
      opening: async () => ({
        cash_opening: (await balanceTotals(effectiveEnd(start, cutoff)))
          .cash_closing,
      }),
      balanceHistory: () =>
        allRows<{
          date: string;
          assets: string;
          liabilities: string;
          net_assets: string;
        }>(() =>
          db
            .from("balance_history_read")
            .select("date," + sums("assets", "liabilities", "net_assets"))
            .gte(
              "date",
              new Date(Date.parse(start) + 8 * 3600000)
                .toISOString()
                .slice(0, 10),
            )
            .lte(
              "date",
              new Date(Date.parse(cutoff) + 8 * 3600000 - 1)
                .toISOString()
                .slice(0, 10),
            )
            .order("date"),
        ),
      cashDaily: () =>
        allRows<{ date: string; inflow: string; outflow: string }>(() =>
          period("cashflow_read", "date," + sums("inflow", "outflow")).order(
            "date",
          ),
        ),
      quality: () =>
        read<Overview["quality"]>(
          before(
            "transactions",
            "pending:pending_count.sum(),missing_entries:missing_entry_count.sum(),missing_accounts:missing_account_count.sum(),posted:posted_count.sum(),coverage_start:occurred_at.min()",
          ).single(),
        ),
      periodQuality: () =>
        read<{ pending: number | null }>(
          period("transactions", "pending:pending_count.sum()").single(),
        ),
    };
  }
  async function report<K extends keyof ReturnType<typeof reportQueries>>(
    part: K,
    start: string,
    end: string,
    asOf: string,
  ): Promise<Awaited<ReturnType<ReturnType<typeof reportQueries>[K]>>> {
    const result = await reportQueries(start, end, asOf)[part]();
    if (part === "categories")
      (result as Overview["categories"]).sort((a, b) =>
        new Decimal(b.amount).comparedTo(a.amount),
      );
    return result as Awaited<ReturnType<ReturnType<typeof reportQueries>[K]>>;
  }
  return {
    report,
    async home(charts = true) {
      const snapshot = await read<HomeSnapshot>(
        db
          .from("home")
          .select(
            "as_of,start,future_end,assets,liabilities,net_assets,income,expense,profit,pending,cash_configured,cash,month_cash" +
              (charts ? ",balance_trend,cash_bars,month_cash_bars" : ""),
          )
          .single(),
      );
      return {
        ...snapshot,
        as_of: new Date(snapshot.as_of).toISOString(),
        start: new Date(snapshot.start).toISOString(),
        future_end: new Date(snapshot.future_end).toISOString(),
      };
    },
    async accounts() {
      const { data, error } = await db
        .from("account")
        .select("*")
        .order("type")
        .order("subtype")
        .order("name")
        .limit(1000);
      if (error) throw new ApiError(error.code, error.message);
      return data as Account[];
    },
    async list(filters: Filters, cursor: Cursor, pageSize = 30): Promise<Page> {
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 30)
        throw new ApiError("VALIDATION", "分页大小无效");
      let query = db.from("transactions").select(transactionColumns);
      if (filters.start) query = query.gte("occurred_at", filters.start);
      if (filters.end) query = query.lt("occurred_at", filters.end);
      // A literal, case-insensitive substring; regex escaping prevents search operators.
      if (filters.search)
        query = query.filter(
          "search_text",
          "imatch",
          escapeRegex(filters.search),
        );
      if (filters.review === "needed") query = query.eq("needs_review", true);
      if (filters.review === "unmatched")
        query = query.gt("missing_accounts", 0);
      if (filters.status) query = query.eq("status", filters.status);
      if (filters.payment_method)
        query = query.eq("payment_method", filters.payment_method);
      if (filters.posted === "true") query = query.eq("posted_count", 1);
      if (filters.account_id)
        query = query.contains("account_ids", [Number(filters.account_id)]);
      if (filters.account_type)
        query = query.contains("account_types", [filters.account_type]);
      if (filters.matched === "true")
        query = query.eq("missing_accounts", 0).gt("entry_count", 0);
      if (filters.cash === "true") query = query.eq("has_cash_flow", true);
      if (cursor) {
        if (
          !Number.isSafeInteger(cursor.id) ||
          !Number.isFinite(Date.parse(cursor.occurred_at))
        )
          throw new ApiError("VALIDATION", "分页位置无效");
        const at = quoteFilter(cursor.occurred_at);
        query = query.or(
          `occurred_at.lt.${at},and(occurred_at.eq.${at},id.lt.${cursor.id})`,
        );
      }
      const rows = await read<Transaction[]>(
        query
          .order("occurred_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(pageSize + 1),
      );
      const items = rows.slice(0, pageSize);
      const last = items.at(-1);
      return {
        items,
        next_cursor:
          rows.length > pageSize && last
            ? { occurred_at: last.occurred_at, id: last.id }
            : null,
      };
    },
    async transaction(id: number) {
      return read<Transaction | null>(
        db
          .from("transactions")
          .select(transactionColumns)
          .eq("id", id)
          .maybeSingle(),
      );
    },
    cashflow: cashTotals,
    balance: balanceTotals,
    async overview(
      start: string,
      end: string,
      asOf: string,
    ): Promise<Overview> {
      const cutoff = effectiveEnd(end, asOf);
      const queries = reportQueries(start, end, asOf);
      const [
        balance,
        accounts,
        pnl,
        categories,
        trend,
        cash,
        cashCategories,
        opening,
        quality,
        periodQuality,
      ] = await Promise.all([
        queries.balance(),
        queries.accounts(),
        queries.income(),
        queries.categories(),
        queries.trend(),
        queries.cash(),
        queries.cashCategories(),
        queries.opening(),
        queries.quality(),
        queries.periodQuality(),
      ]);
      return {
        as_of: cutoff,
        assets: balance.assets ?? "0",
        liabilities: balance.liabilities ?? "0",
        net_assets: balance.net_assets ?? "0",
        income: pnl.income ?? "0",
        expense: pnl.expense ?? "0",
        profit: pnl.profit ?? "0",
        ...cash,
        cash_opening: opening.cash_opening ?? "0",
        cash_closing: balance.cash_closing ?? "0",
        accounts,
        categories: categories.sort((a, b) =>
          new Decimal(b.amount).comparedTo(a.amount),
        ),
        cash_categories: cashCategories,
        trend,
        quality: {
          pending: quality.pending ?? 0,
          period_pending: periodQuality.pending ?? 0,
          missing_entries: quality.missing_entries ?? 0,
          missing_accounts: quality.missing_accounts ?? 0,
          posted: quality.posted ?? 0,
          coverage_start: quality.coverage_start,
          generated_at: new Date().toISOString(),
        },
      };
    },
    save: (id: number | null, updatedAt: string | null, payload: Payload) =>
      rpc<Transaction>("save_transaction", {
        p_id: id,
        p_updated_at: updatedAt,
        p_payload: payload,
      }),
    saveAccount: (id: number | null, payload: Partial<Account>) =>
      rpc<Account>("save_account", { p_id: id, p_payload: payload }),
  };
}
export type Repository = ReturnType<typeof createRepository>;

// These helpers only shape queries. SQL computes all authoritative report amounts.
function sums(...columns: string[]) {
  return columns
    .map((column) => `${column}:${column}::numeric.sum()::text`)
    .join(",");
}
export function effectiveEnd(end: string, asOf: string) {
  // Preserve PostgreSQL microseconds even when both boundaries share one JS millisecond.
  const micros = (value: string) => {
    const fraction = value.match(/\.(\d+)(?:Z|[+-]\d{2}:?\d{2})$/i)?.[1] ?? "";
    return (
      BigInt(Date.parse(value)) * 1000n +
      BigInt(fraction.slice(3, 6).padEnd(3, "0"))
    );
  };
  return micros(end) <= micros(asOf) ? end : asOf;
}
function quoteFilter(value: string) {
  return JSON.stringify(value);
}
function escapeRegex(value: string) {
  return [...value]
    .map((char) => ("\\^$.*+?()[]{}|".includes(char) ? "\\" + char : char))
    .join("");
}
const transactionColumns =
  "id,occurred_at,created_at,updated_at,status,payment_method,payment_id,notes,merchant,entry_count,missing_accounts,complete,amount,kind,entries";
