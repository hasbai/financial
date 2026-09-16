import {
  test as base,
  expect,
  type Page,
  type Locator,
} from "@playwright/test";
import { accounts as baseAccounts, transaction } from "../src/test/fixtures";

// Synthetic data only. HTTP is intercepted before mounting the actual Repository.
const accounts = [
  ...baseAccounts,
  { id: 3, type: "收入", subtype: "工资", name: "工资收入", notes: null },
  { id: 4, type: "负债", subtype: "信用卡", name: "信用卡", notes: null },
];
const balances = [
  { ...accounts[1], balance: "12345.67" },
  { ...accounts[3], balance: "2300.00" },
];
const rows = {
  account: accounts,
  transactions: [transaction],
  balance: balances,
  balance_history: ["2026-09-01", "2026-09-08", "2026-09-15"].flatMap(
    (date, i) =>
      balances.map((b) => ({
        ...b,
        date,
        balance: b.id === 2 ? String(12000 + i * 172.835) : b.balance,
      })),
  ),
  income_statement: [
    {
      occurred_at: transaction.occurred_at,
      date: "2026-09-01",
      type: "支出",
      subtype: "餐饮",
      income: "0",
      expense: "100",
      profit: "-100",
      amount: "100",
    },
    {
      occurred_at: "2026-09-08T00:00:00Z",
      date: "2026-09-08",
      type: "收入",
      subtype: "工资",
      income: "8000",
      expense: "0",
      profit: "8000",
      amount: "8000",
    },
  ],
  cashflow: [
    { transaction_id: 7, occurred_at: transaction.occurred_at, net: "-100" },
    { transaction_id: 8, occurred_at: "2026-09-08T00:00:00Z", net: "8000" },
  ],
};
type State = "normal" | "loading" | "error" | "empty";
export const test = base.extend<{
  app: {
    open: (path?: string, state?: State) => Promise<void>;
    recover: () => void;
  };
}>({
  app: async ({ page }, use) => {
    const errors: string[] = [];
    let state: State = "normal";
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.setFixedTime(new Date("2026-09-16T02:00:00Z"));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== "http://127.0.0.1:4173") {
        errors.push(`Unexpected external request: ${url.origin}`);
        return route.abort();
      }
      if (!url.pathname.startsWith("/test-api/")) return route.continue();
      const view = url.pathname.split("/").at(-1)!;
      if (state === "loading") return; // held until page/context closes; no timer races
      if (state === "error")
        return route.fulfill({
          status: 503,
          json: { code: "503", message: "加载失败" },
        });
      if (view === "save_account") {
        const body = route.request().postDataJSON();
        return route.fulfill({
          json: { ...body.p_payload, id: body.p_id ?? 10 },
        });
      }
      if (view === "save_transaction")
        return route.fulfill({ json: transaction });
      if (!(view in rows)) throw new Error(`Unimplemented fixture: ${view}`);
      let data: unknown =
        state === "empty" ? [] : rows[view as keyof typeof rows];
      if (view === "transactions" && url.searchParams.has("id"))
        data = state === "empty" ? null : transaction;
      return route.fulfill({ json: data });
    });
    await use({
      open: async (path = "/", next = "normal") => {
        state = next;
        await page.goto(`/e2e/index.html?path=${encodeURIComponent(path)}`);
        await page.evaluate(() => document.fonts.ready);
      },
      recover: () => {
        state = "normal";
      },
    });
    expect(errors, "Browser errors / unexpected external traffic").toEqual([]);
  },
});
export { expect };

export async function fitsViewport(page: Page) {
  const width = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(width.content).toBeLessThanOrEqual(width.viewport);
}
export async function reachable(control: Locator) {
  await expect(control).toBeInViewport({ ratio: 1 });
  // Closing animations and Bits UI's deferred scroll/pointer unlock can finish
  // after the panel detaches. Require eventual hitability without a fixed sleep.
  await expect
    .poll(
      () =>
        control.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(
            r.x + r.width / 2,
            r.y + r.height / 2,
          );
          return top === el || el.contains(top);
        }),
      { message: "Control must not be covered by fixed chrome" },
    )
    .toBe(true);
  const target = await control.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height };
  });
  expect(target.width).toBeGreaterThanOrEqual(48);
  expect(target.height).toBeGreaterThanOrEqual(48);
}

// Document width alone cannot detect a portaled panel above/below the screen.
export async function sheetFitsViewport(dialog: Locator) {
  await expect(dialog).toBeVisible();
  // This checks the shipping CSS, including minification and responsive layers.
  // Desktop centering must never apply to a mobile sheet.
  await expect(dialog).toHaveCSS("translate", "none");
  await expect
    .poll(
      () =>
        dialog.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const v = window.visualViewport;
          const top = v?.offsetTop ?? 0;
          const bottom = top + (v?.height ?? innerHeight);
          return (
            r.left >= -1 &&
            r.right <= innerWidth + 1 &&
            r.top >= top - 1 &&
            r.height > 0 &&
            Math.abs(r.bottom - bottom) <= 1
          );
        }),
      {
        message:
          "Sheet must fit and be anchored to the visible viewport bottom",
      },
    )
    .toBe(true);
}
