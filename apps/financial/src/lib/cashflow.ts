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

export async function loadCashBars(
  api: Pick<Repository, "report">,
  range: CashPeriod,
  asOf: string,
): Promise<CashBar[]> {
  const rows = await api.report("cashDaily", range.start, range.end, asOf);
  return rows.map((row) => {
    const period = dayPeriod(row.date);
    return {
      start: new Date(
        Math.max(Date.parse(period.start), Date.parse(range.start)),
      ).toISOString(),
      end: new Date(
        Math.min(
          Date.parse(period.end),
          Date.parse(range.end),
          Date.parse(asOf),
        ),
      ).toISOString(),
      inflow: row.inflow,
      outflow: row.outflow,
    };
  });
}

export function dayPeriod(date: string): CashPeriod {
  const start = `${date}T00:00:00+08:00`;
  return { start, end: new Date(Date.parse(start) + day).toISOString() };
}
export function dayLink(date: string, filters: Record<string, string> = {}) {
  return (
    "/transactions?" +
    new URLSearchParams({ ...dayPeriod(date), posted: "true", ...filters })
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
