import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/svelte";
import {
  QueryClient,
  focusManager,
  onlineManager,
} from "@tanstack/svelte-query";
import Harness from "../test/Harness.svelte";
import { createRepository } from "../lib/api";
import { router } from "../lib/router.svelte";
import { accounts, transaction, overview } from "../test/fixtures";

const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((cache) => cache.clear());
  vi.unstubAllGlobals();
  vi.useRealTimers();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
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
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const api = createRepository(async () => "test-token", cache);
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
    api,
    setFailHome: (value = true) => {
      failHome = value;
    },
    setNonempty: () => {
      nonempty = true;
    },
    failCategories: (value: boolean) => {
      failCategories = value;
    },
  };
}

it("loads only home data, reuses the closing balance, and fetches panel details on demand", async () => {
  const { requests } = setup();
  await screen.findByText("暂无现金流");
  await screen.findByRole("heading", { name: "净资产" });
  expect(requests).toHaveLength(6);
  expect(new Set(requests.map(String)).size).toBe(requests.length);

  const before = requests.length;
  await fireEvent.click(screen.getByRole("button", { name: "资产负债" }));
  await screen.findByRole("region", { name: "科目余额" });
  expect(requests).toHaveLength(before);
  await fireEvent.click(screen.getByRole("button", { name: "损益" }));
  await screen.findByRole("region", { name: "损益明细" });
  expect(requests).toHaveLength(before);
  await fireEvent.click(screen.getByRole("button", { name: "总览" }));
  await screen.findByText("暂无现金流");
  expect(requests).toHaveLength(before);
  await fireEvent.click(screen.getByRole("button", { name: "所选月份" }));
  await screen.findByText("本期净流入");
  expect(requests).toHaveLength(before);
});

it("loads only list, account labels and monthly income/cash/trend on direct list navigation", async () => {
  const { requests } = setup("transactions");
  await screen.findByRole("region", { name: "月度收支" });
  await screen.findByText("示例消费");
  expect(requests).toHaveLength(4);
  expect(requests.some((r) => r.pathname.endsWith("balance"))).toBe(false);
});

it("does not load the covered transaction page on a direct editor route", async () => {
  const { requests } = setup("transactions", false, "/transactions/7");
  await screen.findByRole("heading", { name: "交易流水" });
  expect(requests).toHaveLength(0);
});

it("shares fresh reports across pages and refreshes visible reports after invalidation", async () => {
  const { requests, rerender, cache } = setup();
  await screen.findByText("暂无现金流");
  await screen.findByRole("heading", { name: "净资产" });
  const before = requests.length;
  router.navigate("/transactions", true, true);
  await rerender({ page: "transactions" });
  await screen.findByRole("region", { name: "月度收支" });
  await screen.findByText("示例消费");
  // All source rows and account labels are shared; only the list is new.
  expect(requests).toHaveLength(before + 1);
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
  view.cache.removeQueries({
    predicate: (q) => String(q.queryKey[2]).startsWith("income:"),
  });
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

it("loads history once on unhide and reuses it on subsequent toggles", async () => {
  const { requests, setNonempty, rerender } = setup("overview", true);
  setNonempty();
  await screen.findByText("本期净流入");
  expect(requests.some((r) => r.pathname.endsWith("/balance_history"))).toBe(
    false,
  );
  await rerender({ hidden: false });
  await screen.findByRole("img", { name: /每日现金流入与流出柱状图/ });
  expect(requests).toHaveLength(6);
  const count = requests.length;
  await rerender({ hidden: true });
  await rerender({ hidden: false });
  expect(requests).toHaveLength(count);
});
it("refreshes each homepage source once after saving", async () => {
  const { requests, cache } = setup();
  await screen.findByText("暂无现金流");
  await cache.invalidateQueries({ queryKey: ["overview"] });
  expect(requests).toHaveLength(11);
});

it("does not hide a failed snapshot behind disabled historical queries", async () => {
  const { setFailHome, cache, requests } = setup();
  await screen.findByText("暂无现金流");
  setFailHome();
  await cache.invalidateQueries({ queryKey: ["overview"] });
  await screen.findByText("首页加载失败");
  await fireEvent.change(screen.getAllByLabelText("报表月份")[0], {
    target: { value: "2025-01" },
  });
  await screen.findByText("首页加载失败");
  expect(requests.filter((r) => r.pathname.endsWith("/balance"))).toHaveLength(
    2,
  );
});

it("reuses reports and accounts after twenty minutes, navigation, focus and reconnect", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-15T07:00:00Z"));
  const view = setup();
  await screen.findByText("暂无现金流");
  expect(view.requests).toHaveLength(6);
  router.navigate("/transactions", true, true);
  await view.rerender({ page: "transactions" });
  await screen.findByText("示例消费");
  expect(view.requests).toHaveLength(7);
  vi.setSystemTime(new Date("2026-09-15T07:20:00Z"));
  router.navigate("/", true, true);
  await view.rerender({ page: "overview" });
  await screen.findByText("暂无现金流");
  focusManager.setFocused(false);
  focusManager.setFocused(true);
  onlineManager.setOnline(false);
  onlineManager.setOnline(true);
  await waitFor(() => expect(view.cache.isFetching()).toBe(0));
  expect(view.requests).toHaveLength(7);
  await view.api.accounts();
  expect(
    view.requests.filter((r) => r.pathname.endsWith("/account")),
  ).toHaveLength(1);
});

it("retries only the failed home source and reuses successful rows", async () => {
  const view = setup();
  view.setFailHome();
  await screen.findByText("首页加载失败");
  expect(view.requests).toHaveLength(6);
  view.setFailHome(false);
  await fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await screen.findByText("暂无现金流");
  expect(view.requests).toHaveLength(7);
  expect(view.requests.at(-1)?.pathname).toMatch(/\/balance$/);
});

it("clears source rows with the session cache and reloads fresh accounts", async () => {
  const view = setup();
  await screen.findByText("暂无现金流");
  view.unmount();
  view.cache.clear();
  await view.api.home();
  expect(view.requests).toHaveLength(12);
  expect(
    view.requests.filter((r) => r.pathname.endsWith("/account")),
  ).toHaveLength(2);
});

it("refreshes date-dependent reports on the next Beijing day while reusing accounts", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-15T15:59:00Z"));
  const view = setup();
  await screen.findByText("暂无现金流");
  router.navigate("/transactions/7", true, true);
  await view.rerender({ page: "transactions" });
  vi.setSystemTime(new Date("2026-09-15T16:01:00Z"));
  router.navigate("/", true, true);
  await view.rerender({ page: "overview" });
  await waitFor(() => expect(view.cache.isFetching()).toBe(0));
  await screen.findByText("暂无现金流");
  expect(view.requests).toHaveLength(11);
  expect(
    view.requests.filter((r) => r.pathname.endsWith("/account")),
  ).toHaveLength(1);
});
