import { expect, it, vi } from "vitest";
import { nextThirtyDays, loadCashBars, dayLink } from "./cashflow";
it("keeps the exact thirty day range across a year boundary", () => {
  expect(nextThirtyDays("2026-12-20T04:30:00.000Z").end).toBe(
    "2027-01-19T04:30:00.000Z",
  );
});
it("loads SQL daily totals once, preserves decimals and clips day drilldown to the report", async () => {
  const api = {
    report: vi
      .fn()
      .mockResolvedValue([
        { date: "2026-09-14", inflow: "9007199254740993.01", outflow: "67.89" },
      ]),
  };
  const range = {
    start: "2026-09-14T02:00:00.000Z",
    end: "2026-09-14T04:00:00.000Z",
  };
  expect(await loadCashBars(api, range, range.end)).toEqual([
    { ...range, inflow: "9007199254740993.01", outflow: "67.89" },
  ]);
  expect(api.report).toHaveBeenCalledExactlyOnceWith(
    "cashDaily",
    range.start,
    range.end,
    range.end,
  );
});
it("rejects failed daily queries", async () => {
  const api = { report: vi.fn().mockRejectedValue(new Error("offline")) };
  const range = nextThirtyDays("2026-09-14T02:00:00Z");
  await expect(loadCashBars(api, range, range.end)).rejects.toThrow("offline");
});
it("links a Beijing day including month rollover", () => {
  const params = new URL(
    dayLink("2026-09-30", { cash: "true" }),
    "https://example.com",
  ).searchParams;
  expect(params.get("start")).toBe("2026-09-30T00:00:00+08:00");
  expect(params.get("end")).toBe("2026-09-30T16:00:00.000Z");
  expect(params.get("cash")).toBe("true");
});
