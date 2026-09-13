import { describe, it, expect } from "vitest";
import {
  money,
  monthRange,
  totals,
  amountSchema,
  safeReturnPath,
  validatePost,
} from "./finance";
import type { Payload } from "./types";
describe("money and dates", () => {
  it("adds decimal amounts without float error", () =>
    expect(
      totals([
        { direction: "借", amount: "0.1", account_id: 1 },
        { direction: "借", amount: "0.2", account_id: 1 },
      ])["借"].toString(),
    ).toBe("0.3"));
  it("rejects rounding, negatives, exponent and oversize", () => {
    for (const v of ["1.001", "-1", "1e2", "10000000000", "0"])
      expect(amountSchema.safeParse(v).success).toBe(false);
  });
  it("distinguishes zero, unknown and hidden", () => {
    expect(money(null)).toBe("待补录");
    expect(money("0")).toBe("¥0.00");
    expect(money("100", true)).toBe("••••");
    expect(money("-1234.50")).toBe("−¥1,234.50");
  });
  it("uses Shanghai half-open months across years", () =>
    expect(monthRange("2026-12")).toEqual({
      start: "2026-11-30T16:00:00.000Z",
      end: "2026-12-31T16:00:00.000Z",
    }));
  it("restricts auth return paths", () => {
    for (const s of [
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "/auth/callback",
    ])
      expect(safeReturnPath(s)).toBe("/");
    expect(safeReturnPath("/transactions?review=needed")).toBe(
      "/transactions?review=needed",
    );
  });
  it("requires valid complete entries for posting", () => {
    const p = {
      occurred_at: "2026-09-13T00:00:00Z",
      status: "success",
      payment_method: "direct",
      payment_id: "",
      merchant: "",
      notes: "",
      entries: [
        { direction: "借", amount: "1.00", account_id: 1 },
        { direction: "贷", amount: "1.00", account_id: 2 },
      ],
    } as Payload;
    expect(validatePost(p)).toEqual([]);
    expect(validatePost({ ...p, entries: [p.entries[0]] })).toContain(
      "至少需要两条分录",
    );
  });
});
