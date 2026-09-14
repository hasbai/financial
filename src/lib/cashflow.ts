import type { Repository } from "./api";

const day = 86_400_000;
export type CashPeriod = { start: string; end: string };
export type CashBar = CashPeriod & { inflow: string; outflow: string };

export function nextThirtyDays(now: string): CashPeriod {
  return {
    start: now,
    end: new Date(Date.parse(now) + 30 * day).toISOString(),
  };
}

// Only dates are divided here. All authoritative cash amounts come from SQL.
export function cashPeriods(range: CashPeriod): CashPeriod[] {
  const start = Date.parse(range.start);
  const end = Date.parse(range.end);
  const count = Math.ceil((end - start) / (6 * day));
  return Array.from({ length: Math.max(0, count) }, (_, i) => ({
    start: new Date(start + i * 6 * day).toISOString(),
    end: new Date(Math.min(end, start + (i + 1) * 6 * day)).toISOString(),
  }));
}

export async function loadCashBars(
  api: Pick<Repository, "cashflow">,
  range: CashPeriod,
  asOf: string,
): Promise<CashBar[]> {
  return Promise.all(
    cashPeriods(range).map(async (period) => {
      const report = await api.cashflow(period.start, period.end, asOf);
      return { ...period, inflow: report.cash_in, outflow: report.cash_out };
    }),
  );
}

export function cashDate(value: string, time = false) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    ...(time
      ? ({ year: "numeric", hour: "2-digit", minute: "2-digit" } as const)
      : {}),
  }).format(new Date(value));
}
