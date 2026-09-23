import { QueryClient } from "@tanstack/svelte-query";
import { reportTime, sessionQueryOptions } from "./query-cache";
import { createDataClient } from "@hasbai/data";

import Decimal from "decimal.js";
import { dayPeriod, nextThirtyDays } from "./cashflow";
const Money = Decimal.clone({ precision: 40 });
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
export function createRepository(
  getToken: () => Promise<string>,
  cache = new QueryClient(),
) {
  const db = createDataClient(config.dataApiUrl, config.schema, getToken);
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
  function shared<T>(key: string, load: () => Promise<T>): Promise<T> {
    return cache.fetchQuery({
      queryKey: ["overview", "source", key],
      queryFn: load,
      ...sessionQueryOptions,
      retry: false,
    });
  }
  function accounts() {
    return cache.fetchQuery({
      queryKey: ["accounts", "source"],
      queryFn: () =>
        allRows<Account>(() =>
          db
            .from("account")
            .select("*")
            .order("type")
            .order("subtype")
            .order("name")
            .order("id"),
        ),
      ...sessionQueryOptions,
      retry: false,
    });
  }
  function balanceRows(asOf: string) {
    const date = localDate(asOf);
    const today = localDate(new Date().toISOString());
    const midnight =
      new Date(Date.parse(asOf) + 8 * 3600000).toISOString().slice(11) ===
      "00:00:00.000Z";
    const current = date >= today && !midnight;
    const closingDate = localDate(new Date(Date.parse(asOf) - 1).toISOString());
    return shared(`balance:${current ? "current" : closingDate}`, () =>
      allRows<BalanceRow>(() => {
        let query = db
          .from(current ? "balance" : "balance_history")
          .select("id,name,type,subtype,balance::text");
        if (!current) query = query.eq("date", closingDate);
        return query.order("id");
      }),
    );
  }
  async function balanceTotals(asOf: string) {
    return summarizeBalances(await balanceRows(asOf));
  }
  function cashRows(start: string, cutoff: string) {
    // Home already holds both month-to-date and future cash. Reuse a complete
    // covering range when a panel/list asks for a subset of those same rows.
    const covering = cache
      .getQueryCache()
      .findAll({
        queryKey: ["overview", "cash-source"],
      })
      .find((query) => {
        const [, , from, to] = query.queryKey as string[];
        return (
          !query.state.isInvalidated &&
          query.state.status === "success" &&
          effectiveEnd(from, start) === from &&
          effectiveEnd(cutoff, to) === cutoff
        );
      });
    if (covering)
      return Promise.resolve(
        (covering.state.data as CashRow[]).filter(
          (row) =>
            effectiveEnd(start, row.occurred_at) === start &&
            effectiveEnd(row.occurred_at, cutoff) !== cutoff,
        ),
      );
    return cache.fetchQuery({
      queryKey: ["overview", "cash-source", start, cutoff],
      ...sessionQueryOptions,
      retry: false,
      queryFn: () =>
        allRows<CashRow>(() =>
          db
            .from("cashflow")
            .select("transaction_id,occurred_at,net::text")
            .gte("occurred_at", start)
            .lt("occurred_at", cutoff)
            .order("occurred_at")
            .order("transaction_id"),
        ),
    });
  }
  async function cashTotals(start: string, end: string, asOf: string) {
    return summarizeCash(await cashRows(start, effectiveEnd(end, asOf)));
  }
  function incomeRows(start: string, cutoff: string) {
    return shared(`income:${start}:${cutoff}`, () =>
      allRows<IncomeRow>(() =>
        db
          .from("income_statement")
          .select("occurred_at,date,type,subtype,income,expense,profit,amount")
          .gte("occurred_at", start)
          .lt("occurred_at", cutoff)
          .order("occurred_at")
          .order("type")
          .order("subtype"),
      ),
    );
  }
  function historyRows(start: string, cutoff: string) {
    return shared(
      `history:${localDate(start)}:${localDate(new Date(Date.parse(cutoff) - 1).toISOString())}`,
      () =>
        allRows<BalanceRow & { date: string }>(() =>
          db
            .from("balance_history")
            .select("date,id,name,type,subtype,balance::text")
            .gte("date", localDate(start))
            .lte(
              "date",
              localDate(new Date(Date.parse(cutoff) - 1).toISOString()),
            )
            .order("date")
            .order("id"),
        ),
    );
  }
  function qualityRows(cutoff: string) {
    return shared(`quality:${cutoff}`, () =>
      allRows<QualityRow>(() =>
        db
          .from("transactions")
          .select("id,occurred_at,entry_count,missing_accounts,complete,status")
          .lt("occurred_at", cutoff)
          .order("occurred_at")
          .order("id"),
      ),
    );
  }
  function reportQueries(start: string, end: string, asOf: string) {
    const cutoff = effectiveEnd(end, asOf);
    return {
      balance: () => balanceTotals(cutoff),
      accounts: () => balanceRows(cutoff),
      income: async () => summarizeIncome(await incomeRows(start, cutoff)),
      categories: async () =>
        [
          ...group(
            (await incomeRows(start, cutoff)).filter((r) =>
              ["收入", "支出"].includes(r.type),
            ),
            (r) => JSON.stringify([r.type, r.subtype]),
          ).values(),
        ].map((rows) => ({
          name: rows[0].subtype,
          type: rows[0].type,
          amount: sum(rows.map((r) => r.amount)),
        })),
      trend: async () =>
        [...group(await incomeRows(start, cutoff), (r) => r.date)].map(
          ([date, rows]) => ({
            date,
            income: sum(rows.map((r) => r.income)),
            expense: sum(rows.map((r) => r.expense)),
          }),
        ),
      cash: () => cashTotals(start, end, asOf),
      cashCategories: async () => {
        const [cash, entries] = await Promise.all([
          cashRows(start, cutoff),
          allRows<{ transaction_id: number; type: string; subtype: string }>(
            () =>
              db
                .from("statement_entries")
                .select("id,transaction_id,type,subtype")
                .gte("occurred_at", start)
                .lt("occurred_at", cutoff)
                .order("id"),
          ),
        ]);
        const byTransaction = group(entries, (e) => String(e.transaction_id));
        return [
          ...group(cash, (row) => {
            const items = byTransaction.get(String(row.transaction_id)) ?? [];
            return items.some((e) => ["收入", "支出"].includes(e.type))
              ? "living"
              : items.some(
                    (e) => e.type === "资产" && e.subtype !== "现金及等价物",
                  )
                ? "investing"
                : "financing";
          }),
        ].map(([name, rows]) => {
          const totals = summarizeCash(rows);
          return { name, inflow: totals.cash_in, outflow: totals.cash_out };
        });
      },
      opening: async () => ({
        cash_opening: (await balanceTotals(effectiveEnd(start, cutoff)))
          .cash_closing,
      }),
      balanceHistory: async () =>
        [...group(await historyRows(start, cutoff), (r) => r.date)].map(
          ([date, rows]) => ({ date, ...summarizeBalances(rows) }),
        ),
      cashDaily: async () => dailyCash(await cashRows(start, cutoff)),
      quality: async () => summarizeQuality(await qualityRows(cutoff)),
      periodQuality: async () => ({
        pending: (await qualityRows(cutoff)).filter(
          (r) => effectiveEnd(start, r.occurred_at) === start && needsReview(r),
        ).length,
      }),
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
    async home(charts = true): Promise<HomeSnapshot> {
      const asOf = reportTime(cache);
      const start = new Date(
        `${localDate(asOf).slice(0, 7)}-01T00:00:00+08:00`,
      ).toISOString();
      const futureEnd = nextThirtyDays(asOf).end;
      const [balances, income, cash, quality, allAccounts, history] =
        await Promise.all([
          balanceRows(asOf),
          incomeRows(start, asOf),
          cashRows(start, futureEnd),
          qualityRows(asOf),
          accounts(),
          charts ? historyRows(start, asOf) : Promise.resolve([]),
        ]);
      const monthCash = cash.filter(
        (r) => effectiveEnd(r.occurred_at, asOf) !== asOf,
      );
      const futureCash = cash.filter(
        (r) => effectiveEnd(r.occurred_at, asOf) === asOf,
      );
      return {
        as_of: asOf,
        start,
        future_end: futureEnd,
        ...summarizeBalances(balances),
        ...summarizeIncome(income),
        pending: summarizeQuality(quality).pending,
        cash_configured: allAccounts.some(
          (a) => a.type === "资产" && a.subtype === "现金及等价物",
        ),
        cash: summarizeCash(futureCash),
        month_cash: summarizeCash(monthCash),
        recent: [],
        ...(charts
          ? {
              balance_trend: [...group(history, (r) => r.date).values()].map(
                (rows) => summarizeBalances(rows).net_assets,
              ),
              cash_bars: cashBars(futureCash, asOf, futureEnd),
              month_cash_bars: cashBars(monthCash, start, asOf),
            }
          : {}),
      };
    },
    accounts,
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
    deleteTransaction: (id: number, updatedAt: string) =>
      rpc<void>("delete_transaction", { p_id: id, p_updated_at: updatedAt }),
    deleteAccount: (id: number) => rpc<void>("delete_account", { p_id: id }),
    saveAccount: (id: number | null, payload: Partial<Account>) =>
      rpc<Account>("save_account", { p_id: id, p_payload: payload }),
  };
}
export type Repository = ReturnType<typeof createRepository>;

type BalanceRow = Overview["accounts"][number];
type CashRow = { transaction_id: number; occurred_at: string; net: string };
type IncomeRow = {
  occurred_at: string;
  date: string;
  type: Account["type"];
  subtype: string;
  income: string;
  expense: string;
  profit: string;
  amount: string;
};
type QualityRow = Pick<
  Transaction,
  | "id"
  | "occurred_at"
  | "entry_count"
  | "missing_accounts"
  | "complete"
  | "status"
>;
function sum(values: string[]) {
  return values
    .reduce((total, value) => total.plus(value), new Money(0))
    .toString();
}
function group<T>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const name = key(row);
    const items = groups.get(name) ?? [];
    items.push(row);
    groups.set(name, items);
  }
  return groups;
}
function localDate(value: string) {
  return new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 10);
}
function summarizeBalances(rows: BalanceRow[]) {
  const assets = sum(
    rows.filter((r) => r.type === "资产").map((r) => r.balance),
  );
  const liabilities = sum(
    rows.filter((r) => r.type === "负债").map((r) => r.balance),
  );
  return {
    assets,
    liabilities,
    net_assets: new Money(assets).minus(liabilities).toString(),
    cash_closing: sum(
      rows
        .filter((r) => r.type === "资产" && r.subtype === "现金及等价物")
        .map((r) => r.balance),
    ),
  };
}
function summarizeCash(rows: CashRow[]) {
  return {
    cash_in: sum(rows.filter((r) => new Money(r.net).gt(0)).map((r) => r.net)),
    cash_out: new Money(
      sum(rows.filter((r) => new Money(r.net).lt(0)).map((r) => r.net)),
    )
      .negated()
      .toString(),
    cash_net: sum(rows.map((r) => r.net)),
  };
}
function summarizeIncome(rows: IncomeRow[]) {
  return {
    income: sum(rows.map((r) => r.income)),
    expense: sum(rows.map((r) => r.expense)),
    profit: sum(rows.map((r) => r.profit)),
  };
}
function needsReview(row: QualityRow) {
  return !row.complete && row.status !== "cancel";
}
function summarizeQuality(rows: QualityRow[]) {
  return {
    pending: rows.filter(needsReview).length,
    missing_entries: rows.filter(
      (r) => r.entry_count === 0 && r.status !== "cancel",
    ).length,
    missing_accounts: rows.filter((r) => r.missing_accounts > 0).length,
    posted: rows.filter(
      (r) =>
        r.complete &&
        ["success", "refund", "partial_refund"].includes(r.status),
    ).length,
    coverage_start: rows[0]?.occurred_at ?? null,
  };
}
function dailyCash(rows: CashRow[]) {
  return [...group(rows, (r) => localDate(r.occurred_at))].map(
    ([date, items]) => {
      const totals = summarizeCash(items);
      return { date, inflow: totals.cash_in, outflow: totals.cash_out };
    },
  );
}
function cashBars(rows: CashRow[], start: string, end: string) {
  return dailyCash(rows).map(({ date, ...totals }) => {
    const day = dayPeriod(date);
    return {
      start: new Date(
        Math.max(Date.parse(start), Date.parse(day.start)),
      ).toISOString(),
      end: effectiveEnd(end, day.end),
      ...totals,
    };
  });
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
