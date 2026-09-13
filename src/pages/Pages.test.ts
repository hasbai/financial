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
import { accounts, transaction, overview } from "../test/fixtures";
import { router } from "../lib/router.svelte";
import { currentMonth, monthRange } from "../lib/finance";
import type { Repository } from "../lib/api";
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.restoreAllMocks();
});
function setup(
  page: "transactions" | "overview" | "accounts",
  hidden = false,
  configure?: (api: Repository) => void,
) {
  router.navigate(page === "overview" ? "/" : "/" + page, true, true);
  const api: Repository = {
    accounts: vi.fn().mockResolvedValue(accounts),
    list: vi
      .fn()
      .mockResolvedValue({ items: [transaction], next_cursor: null }),
    overview: vi.fn().mockResolvedValue(overview),
    transaction: vi.fn().mockResolvedValue(transaction),
    save: vi.fn(),
    saveAccount: vi.fn().mockResolvedValue(accounts[0]),
  };
  configure?.(api);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(cache);
  const view = render(Harness, { api, cache, page, hidden });
  return { api, ...view };
}
it("applies search and review filters to the URL and repository", async () => {
  const { api } = setup("transactions");
  await screen.findByText("示例消费");
  await fireEvent.input(screen.getByLabelText("搜索商户或摘要"), {
    target: { value: "午餐" },
  });
  await fireEvent.click(screen.getByRole("button", { name: "搜索" }));
  await fireEvent.click(screen.getByRole("button", { name: "待匹配" }));
  await waitFor(() =>
    expect(api.list).toHaveBeenLastCalledWith(
      { search: "午餐", review: "unmatched" },
      null,
    ),
  );
  expect(new URLSearchParams(router.location.search).get("review")).toBe(
    "unmatched",
  );
  expect(
    screen.getByRole("link", { name: /示例消费/ }).getAttribute("href"),
  ).toContain("review=unmatched");
});
it("loads the next cursor without losing the first page", async () => {
  const cursor = { occurred_at: transaction.occurred_at, id: transaction.id };
  const { api } = setup("transactions", false, (repo) => {
    vi.mocked(repo.list)
      .mockResolvedValueOnce({ items: [transaction], next_cursor: cursor })
      .mockResolvedValueOnce({
        items: [{ ...transaction, id: 8, merchant: "第二笔消费" }],
        next_cursor: null,
      });
  });
  await fireEvent.click(
    await screen.findByRole("button", { name: "加载更多流水" }),
  );
  await screen.findByText("第二笔消费");
  expect(screen.getByText("示例消费")).toBeTruthy();
  expect(api.list).toHaveBeenLastCalledWith({}, cursor);
  await screen.findByText("已显示全部 2 笔");
});
it("keeps unknown transaction amounts distinct from zero", async () => {
  setup("transactions", false, (repo) => {
    vi.mocked(repo.list).mockResolvedValue({
      items: [
        { ...transaction, amount: null, entry_count: 0, complete: false },
      ],
      next_cursor: null,
    });
  });
  await screen.findByText("金额待补录");
  expect(screen.queryByText("¥0.00")).toBeNull();
});
it("passes the report period and cash scope through drilldown", async () => {
  const { api } = setup("overview");
  await screen.findByText("已记录净资产");
  await fireEvent.click(screen.getByRole("button", { name: "所选月份" }));
  await fireEvent.click(screen.getByRole("button", { name: "查看流水" }));
  const params = new URLSearchParams(router.location.search);
  const range = monthRange(currentMonth());
  expect(Object.fromEntries(params)).toEqual({
    start: range.start,
    end: overview.as_of,
    posted: "true",
    cash: "true",
  });
  expect(api.overview).toHaveBeenCalledWith(
    range.start,
    range.end,
    expect.any(String),
  );
});
it("defaults to recorded future cash flows and drills into exactly thirty days", async () => {
  setup("overview");
  await screen.findByText("未来 30 天净流入");
  expect(
    screen
      .getByRole("button", { name: "未来 30 天" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  await screen.findByRole("img", { name: /现金流入与流出分组柱状图/ });
  await fireEvent.click(screen.getByRole("button", { name: "查看流水" }));
  const params = new URLSearchParams(router.location.search);
  expect(
    Date.parse(params.get("end")!) - Date.parse(params.get("start")!),
  ).toBe(30 * 86400000);
  expect(params.get("posted")).toBe("true");
  expect(params.get("cash")).toBe("true");
});
it("shows an empty future period without inventing a forecast", async () => {
  setup("overview", false, (api) => {
    vi.mocked(api.overview).mockResolvedValue({
      ...overview,
      cash_in: "0",
      cash_out: "0",
      cash_net: "0",
      cash_categories: [],
    });
  });
  await screen.findByText("未来 30 天暂无已记录现金流量");
  expect(
    screen.queryByRole("img", { name: /现金流入与流出分组柱状图/ }),
  ).toBeNull();
});
it("keeps a future query failure distinct from a zero cash flow", async () => {
  setup("overview", false, (api) => {
    vi.mocked(api.overview).mockImplementation(async (start, end, asOf) => {
      if (end === asOf) throw new Error("未来现金流加载失败");
      return overview;
    });
  });
  await screen.findByText("未来现金流加载失败");
  expect(screen.queryByText("未来 30 天暂无已记录现金流量")).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: "所选月份" }));
  await screen.findByText("本期净流入");
});
it("does not query future cash flow without cash accounts", async () => {
  const { api } = setup("overview", false, (api) => {
    vi.mocked(api.accounts).mockResolvedValue([accounts[0]]);
  });
  await screen.findByText(/现金流量待确认/);
  expect(api.overview).toHaveBeenCalledTimes(1);
});
it("hides amounts in the report, trend and accessible data table", async () => {
  setup("overview", true);
  await screen.findByText("已记录净资产");
  expect(screen.getByText("金额已隐藏")).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.queryByRole("table")).toBeNull();
  expect(document.body.textContent).not.toContain("¥");
});
it("edits only the existing account fields and retains its ID", async () => {
  const { api } = setup("accounts");
  await fireEvent.click(await screen.findByRole("button", { name: /银行卡/ }));
  await fireEvent.input(screen.getByLabelText("科目名称"), {
    target: { value: "主银行卡" },
  });
  await fireEvent.click(screen.getByRole("button", { name: "保存科目" }));
  await waitFor(() =>
    expect(api.saveAccount).toHaveBeenCalledWith(2, {
      ...accounts[1],
      name: "主银行卡",
    }),
  );
});
it("clears all filters through the Bits UI select", async () => {
  const { api } = setup("transactions");
  await screen.findByText("示例消费");
  await fireEvent.click(screen.getByRole("button", { name: "展开筛选" }));
  await fireEvent.keyDown(screen.getByRole("button", { name: "交易状态" }), {
    key: "ArrowDown",
  });
  const option = await screen.findByRole("option", { name: "已退款" });
  await fireEvent.pointerUp(option, { button: 0, pointerType: "mouse" });
  await waitFor(() =>
    expect(api.list).toHaveBeenLastCalledWith({ status: "refund" }, null),
  );
  await fireEvent.click(screen.getByRole("button", { name: "清空全部筛选" }));
  await waitFor(() => expect(router.location.search).toBe(""));
});
