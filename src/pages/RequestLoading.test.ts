import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/svelte";
import { QueryClient } from "@tanstack/svelte-query";
import Harness from "../test/Harness.svelte";
import { createRepository } from "../lib/api";
import { router } from "../lib/router.svelte";
import {
  accounts,
  transaction,
  overview,
  homeSnapshot,
} from "../test/fixtures";

const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((cache) => cache.clear());
  vi.unstubAllGlobals();
});

function setup(
  page: "overview" | "transactions" = "overview",
  hidden = false,
  path?: string,
) {
  const requests: URL[] = [];
  let failCategories = false;
  let nonempty = false;
  let failHome = false;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    requests.push(url);
    const view = url.pathname.split("/").at(-1);
    const select = url.searchParams.get("select") ?? "";
    if (failHome && view === "balance")
      return new Response(
        JSON.stringify({ code: "503", message: "首页加载失败" }),
        { status: 503 },
      );
    if (failCategories && view === "income_statement")
      return new Response(
        JSON.stringify({ code: "503", message: "分类加载失败" }),
        { status: 503 },
      );
    const rawIncome = [
      {
        occurred_at: new Date().toISOString(),
        date: "2026-09-01",
        type: "支出",
        subtype: "消费",
        income: "0",
        expense: "10",
        profit: "-10",
        amount: "10",
      },
    ];
    const data =
      view === "account"
        ? accounts
        : view === "transactions"
          ? [transaction]
          : view === "balance"
            ? overview.accounts
            : view === "balance_history"
              ? overview.accounts.map((a) => ({ ...a, date: "2026-09-01" }))
              : view === "income_statement"
                ? rawIncome
                : view === "cashflow"
                  ? nonempty
                    ? [
                        {
                          transaction_id: 7,
                          occurred_at: new Date(
                            Date.now() - 60000,
                          ).toISOString(),
                          net: "-10",
                        },
                      ]
                    : []
                  : [];
    return new Response(JSON.stringify(data), {
      headers: { "content-type": "application/json" },
    });
  });
  const api = createRepository(async () => "test-token");
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  clients.push(cache);
  router.navigate(
    path ?? (page === "overview" ? "/" : "/transactions"),
    true,
    true,
  );
  const rendered = render(Harness, { api, cache, page, hidden });
  return {
    ...rendered,
    requests,
    cache,
    setFailHome: () => {
      failHome = true;
    },
    setNonempty: () => {
      nonempty = true;
    },
    failCategories: (value: boolean) => {
      failCategories = value;
    },
  };
}
const selects = (requests: URL[]) =>
  requests.map((r) => r.searchParams.get("select") ?? "");

it("loads only home data, reuses the closing balance, and fetches panel details on demand", async () => {
  const { requests } = setup();
  await screen.findByText("暂无现金流");
  await waitFor(() =>
    expect(document.querySelector("svg polyline")).toBeTruthy(),
  );
  expect(requests).toHaveLength(6);
  expect(requests.some((r) => /_read$|\/home$/.test(r.pathname))).toBe(false);
  expect(new Set(requests.map(String)).size).toBe(requests.length);
  expect(
    selects(requests).every(
      (s) => !s.includes("entries") && !s.includes(".sum()"),
    ),
  ).toBe(true);

  const before = requests.length;
  await fireEvent.click(screen.getByRole("button", { name: "资产负债" }));
  await screen.findByRole("region", { name: "科目余额" });
  expect(requests).toHaveLength(before + 2);
  expect(
    selects(requests.slice(before)).some((s) => s.startsWith("id,name")),
  ).toBe(true);
  await fireEvent.click(screen.getByRole("button", { name: "损益" }));
  await screen.findByRole("region", { name: "损益明细" });
  expect(requests).toHaveLength(before + 3);
  await fireEvent.click(screen.getByRole("button", { name: "总览" }));
  await screen.findByText("暂无现金流");
  expect(requests).toHaveLength(before + 3);
  await fireEvent.click(screen.getByRole("button", { name: "所选月份" }));
  await screen.findByText("本期净流入");
  expect(requests).toHaveLength(before + 3);
});

it("does not request charts when amounts are hidden", async () => {
  const { requests } = setup("overview", true);
  await screen.findByText("本期净流入");
  expect(requests).toHaveLength(5);
  expect(selects(requests)[0]).not.toContain("balance_trend");
  expect(selects(requests)[0]).not.toContain("cash_bars");
  expect(document.body.textContent).not.toContain("¥");
  await fireEvent.click(screen.getByRole("button", { name: "损益" }));
  await screen.findByRole("region", { name: "损益明细" });
  expect(selects(requests).some((s) => s.startsWith("date,"))).toBe(false);
});

it("loads only list, account labels and monthly income/cash/trend on direct list navigation", async () => {
  const { requests } = setup("transactions");
  await screen.findByRole("region", { name: "月度收支" });
  await screen.findByText("示例消费");
  expect(requests).toHaveLength(4);
  expect(requests.some((r) => r.pathname.endsWith("balance"))).toBe(false);
  expect(
    selects(requests).some((s) => /^(name:|pending:|cash_opening)/.test(s)),
  ).toBe(false);
});

it("does not load the covered transaction page on a direct editor route", async () => {
  const { requests } = setup("transactions", false, "/transactions/7");
  await screen.findByRole("heading", { name: "交易流水" });
  expect(requests).toHaveLength(0);
});

it("shares fresh reports across pages and refreshes visible reports after invalidation", async () => {
  const { requests, rerender, cache } = setup();
  await screen.findByText("暂无现金流");
  await waitFor(() =>
    expect(document.querySelector("svg polyline")).toBeTruthy(),
  );
  const before = requests.length;
  router.navigate("/transactions", true, true);
  await rerender({ page: "transactions" });
  await screen.findByRole("region", { name: "月度收支" });
  await screen.findByText("示例消费");
  // Home seeds income; list, account labels, monthly cash and trend load.
  expect(requests).toHaveLength(before + 4);
  const start = requests.length;
  await cache.invalidateQueries({
    predicate: (q) =>
      ["overview", "transactions"].includes(String(q.queryKey[0])),
  });
  expect(requests).toHaveLength(start + 3);
  expect(
    requests.slice(start).some((r) => r.pathname.endsWith("balance")),
  ).toBe(false);
});

it("keeps failed lazy details separate and retries only the failed query", async () => {
  const view = setup();
  await screen.findByText("暂无现金流");
  view.failCategories(true);
  await fireEvent.click(screen.getByRole("button", { name: "损益" }));
  await screen.findByText("分类加载失败");
  const before = view.requests.length;
  view.failCategories(false);
  await fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await screen.findByRole("region", { name: "损益明细" });
  expect(view.requests).toHaveLength(before + 1);
  expect(
    view.requests
      .slice(before)
      .every((r) => r.pathname.endsWith("income_statement")),
  ).toBe(true);
});

it("changing a month loads only the selected panel and preserves the cash period selection", async () => {
  const { requests } = setup();
  await screen.findByText("暂无现金流");
  await fireEvent.click(screen.getByRole("button", { name: "现金流量" }));
  await fireEvent.click(screen.getByRole("button", { name: "所选月份" }));
  await screen.findByText("本期净流入");
  const before = requests.length;
  await fireEvent.change(screen.getAllByLabelText("报表月份")[0], {
    target: { value: "2025-01" },
  });
  await screen.findByText("本期净流入");
  expect(requests).toHaveLength(before + 2);
  expect(
    requests.slice(before).some((r) => r.pathname.endsWith("balance")),
  ).toBe(false);
  expect(
    screen
      .getByRole("button", { name: "所选月份" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});

it("unhides by reading sources once without page-specific views", async () => {
  const { requests, setNonempty, rerender } = setup("overview", true);
  await screen.findByText("本期净流入");
  setNonempty();
  await rerender({ hidden: false });
  await screen.findByRole("img", { name: /每日现金流入与流出柱状图/ });
  expect(requests).toHaveLength(11);
  expect(requests.some((r) => r.pathname.endsWith("/home"))).toBe(false);
  await fireEvent.click(screen.getByRole("button", { name: "隐藏金额" }));
  expect(requests).toHaveLength(11);
});
it("refreshes each homepage source once after saving", async () => {
  const { requests, cache } = setup();
  await screen.findByText("暂无现金流");
  await cache.invalidateQueries({ queryKey: ["overview"] });
  expect(requests).toHaveLength(12);
  expect(requests.some((r) => r.pathname.endsWith("/home"))).toBe(false);
});

it("does not hide a failed snapshot behind disabled historical queries", async () => {
  const { setFailHome, cache, requests } = setup();
  await screen.findByText("暂无现金流");
  setFailHome();
  await cache.invalidateQueries({ queryKey: ["overview", "home"] });
  await screen.findByText("首页加载失败");
  await fireEvent.change(screen.getAllByLabelText("报表月份")[0], {
    target: { value: "2025-01" },
  });
  await screen.findByText("首页加载失败");
  expect(requests.filter((r) => r.pathname.endsWith("/balance"))).toHaveLength(
    2,
  );
});
