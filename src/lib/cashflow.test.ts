import { expect, it, vi } from "vitest";
import { cashPeriods, nextThirtyDays, loadCashBars } from "./cashflow";
import { overview } from "../test/fixtures";

it("partitions thirty days across year boundaries with no gaps or overlaps", () => {
  const range = nextThirtyDays("2026-12-20T04:30:00.000Z");
  expect(range.end).toBe("2027-01-19T04:30:00.000Z");
  const periods = cashPeriods(range);
  expect(periods).toHaveLength(5);
  expect(periods[0].start).toBe(range.start);
  expect(periods.at(-1)?.end).toBe(range.end);
  periods.forEach((p, i) => {
    expect(Date.parse(p.end) - Date.parse(p.start)).toBe(6 * 86400000);
    if (i) expect(p.start).toBe(periods[i - 1].end);
  });
});
it("clips a monthly final bucket and handles an empty period", () => {
  const range = {
    start: "2026-08-31T16:00:00.000Z",
    end: "2026-09-13T00:30:00.000Z",
  };
  const periods = cashPeriods(range);
  expect(periods).toHaveLength(3);
  expect(periods.at(-1)?.end).toBe(range.end);
  expect(cashPeriods({ start: range.start, end: range.start })).toEqual([]);
});
it("uses SQL cash totals, not profit-and-loss amounts or client sums", async () => {
  const api = {
    cashflow: vi.fn().mockResolvedValue({
      ...overview,
      cash_in: "123.45",
      cash_out: "67.89",
      income: "9999",
      expense: "8888",
    }),
  };
  const range = nextThirtyDays("2026-09-14T02:00:00.000Z");
  const bars = await loadCashBars(api, range, range.end);
  expect(bars).toHaveLength(5);
  expect(
    bars.every((b) => b.inflow === "123.45" && b.outflow === "67.89"),
  ).toBe(true);
  expect(api.cashflow).toHaveBeenCalledTimes(5);
  expect(api.cashflow).toHaveBeenLastCalledWith(
    bars[4].start,
    range.end,
    range.end,
  );
});
it("rejects incomplete chart results rather than presenting failed buckets as zero", async () => {
  const api = {
    cashflow: vi
      .fn()
      .mockResolvedValue(overview)
      .mockRejectedValueOnce(new Error("offline")),
  };
  const range = nextThirtyDays("2026-09-14T02:00:00.000Z");
  await expect(loadCashBars(api, range, range.end)).rejects.toThrow("offline");
});
