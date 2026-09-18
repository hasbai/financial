import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/svelte";
import { QueryClient } from "@tanstack/svelte-query";
import Harness from "../test/Harness.svelte";
import {
  accounts,
  transaction,
  overview,
  reportParts,
  homeSnapshot,
} from "../test/fixtures";
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
it("matches the overview hierarchy and exposes supporting reports through controls", async () => {
  setup("overview");
  await screen.findByRole("heading", { name: "净资产" });
  expect(screen.queryByRole("heading", { name: "本月收支趋势" })).toBeNull();
  expect(screen.queryByRole("region", { name: "科目余额" })).toBeNull();
  expect(
    screen.getByRole("link", { name: "待补录 2 笔" }).getAttribute("href"),
  ).toBe("/transactions?review=needed");
  await fireEvent.click(screen.getByRole("button", { name: "资产负债" }));
  await screen.findByRole("region", { name: "科目余额" });
  expect(screen.queryByRole("region", { name: "最近交易" })).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: "损益" }));
  await screen.findByRole("region", { name: "损益明细" });
});
it("shows actual monthly summary and signed transaction amounts", async () => {
  setup("transactions");
  const summary = await screen.findByRole("region", { name: "月度收支" });
  expect(within(summary).getByText("¥200.00")).toBeTruthy();
  await screen.findByText("− ¥100.00");
  await fireEvent.click(screen.getByRole("button", { name: "支出" }));
  expect(new URLSearchParams(router.location.search).get("account_type")).toBe(
    "支出",
  );
});
it("uses an inclusive date control while preserving SQL half-open date filters", async () => {
  const { api } = setup("transactions");
  await screen.findByText("示例消费");
  await fireEvent.change(screen.getByLabelText("流水月份"), {
    target: { value: "2026-09" },
  });
  await fireEvent.click(screen.getByRole("button", { name: "展开筛选" }));
  expect((screen.getByLabelText("起始日期") as HTMLInputElement).value).toBe(
    "2026-09-01",
  );
  expect((screen.getByLabelText("结束日期") as HTMLInputElement).value).toBe(
    "2026-09-30",
  );
  await fireEvent.change(screen.getByLabelText("结束日期"), {
    target: { value: "2026-09-15" },
  });
  await waitFor(() =>
    expect(api.list).toHaveBeenLastCalledWith(
      { start: "2026-08-31T16:00:00.000Z", end: "2026-09-15T16:00:00.000Z" },
      null,
    ),
  );
});
function setup(
  page: "transactions" | "overview" | "accounts" | "shell",
  hidden = false,
  configure?: (api: Repository) => void,
) {
  router.navigate(
    page === "overview" ? "/" : page === "shell" ? "/settings" : "/" + page,
    true,
    true,
  );
  const api: Repository = {
    home: vi.fn(async () => {
      const snapshot = homeSnapshot();
      snapshot.cash_configured = (await api.accounts()).some(
        (a) => a.type === "资产" && a.subtype === "现金及等价物",
      );
      if (snapshot.cash_configured)
        snapshot.cash = await api.cashflow(
          snapshot.as_of,
          snapshot.future_end,
          snapshot.future_end,
        );
      return snapshot;
    }),
    accounts: vi.fn().mockResolvedValue(accounts),
    list: vi
      .fn()
      .mockResolvedValue({ items: [transaction], next_cursor: null }),
    balance: vi.fn().mockResolvedValue({
      assets: "100",
      liabilities: "0",
      net_assets: "100",
      cash_closing: "100",
    }),
    cashflow: vi.fn().mockResolvedValue(overview),
    overview: vi.fn().mockResolvedValue(overview),
    report: vi.fn(
      async (part: keyof typeof reportParts) => reportParts[part],
    ) as Repository["report"],
    transaction: vi.fn().mockResolvedValue(transaction),
    save: vi.fn(),
    deleteTransaction: vi.fn().mockResolvedValue(undefined),
    deleteAccount: vi.fn().mockResolvedValue(undefined),
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
  expect(screen.queryByRole("button", { name: "加载更多流水" })).toBeNull();
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
  await screen.findByText("净资产");
  await fireEvent.click(screen.getByRole("button", { name: "所选月份" }));
  await fireEvent.click(screen.getByRole("button", { name: "查看流水" }));
  const params = new URLSearchParams(router.location.search);
  const range = monthRange(currentMonth());
  expect(Object.fromEntries(params)).toEqual({
    start: range.start,
    end: expect.any(String),
    posted: "true",
    cash: "true",
  });
  expect(api.report).toHaveBeenCalledWith(
    "cash",
    range.start,
    range.end,
    expect.any(String),
  );
});
it("selects recorded future cash flows and drills into exactly thirty days", async () => {
  setup("overview");
  await screen.findByText("本期净流入");
  await fireEvent.click(screen.getByRole("button", { name: "未来 30 天" }));
  await screen.findByText("未来 30 天净流入");
  expect(
    screen
      .getByRole("button", { name: "未来 30 天" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  await screen.findByRole("img", { name: /每日现金流入与流出柱状图/ });
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
    vi.mocked(api.cashflow).mockResolvedValue({
      cash_in: "0",
      cash_out: "0",
      cash_net: "0",
    });
  });
  await screen.findByText("本期净流入");
  await fireEvent.click(screen.getByRole("button", { name: "未来 30 天" }));
  await screen.findByText("暂无现金流");
  expect(
    screen.queryByRole("img", { name: /每日现金流入与流出柱状图/ }),
  ).toBeNull();
});
it("keeps a future query failure distinct from a zero cash flow", async () => {
  const { api } = setup("overview", false, (api) => {
    vi.mocked(api.home).mockRejectedValueOnce(new Error("未来现金流加载失败"));
  });
  await screen.findByText("未来现金流加载失败");
  expect(screen.queryByText("暂无现金流")).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await screen.findByText("本期净流入");
  await fireEvent.click(screen.getByRole("button", { name: "未来 30 天" }));
  await screen.findByText("未来 30 天净流入");
  expect(api.home).toHaveBeenCalledTimes(2);
});
it("does not query future cash flow without cash accounts", async () => {
  const { api } = setup("overview", false, (api) => {
    vi.mocked(api.accounts).mockResolvedValue([accounts[0]]);
  });
  await screen.findByRole("link", { name: "设置账户" });
  expect(
    vi
      .mocked(api.cashflow)
      .mock.calls.some(
        ([start, end]) =>
          Date.parse(end) - Date.parse(start) === 30 * 86400000 &&
          Date.parse(start) > Date.parse(overview.as_of),
      ),
  ).toBe(false);
});
it("hides amounts in the report, trend and accessible data table", async () => {
  setup("overview", true);
  await screen.findByText("净资产");
  expect(screen.getByRole("button", { name: "显示金额" })).toBeTruthy();
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
it("clears all filters after selecting a mobile filter", async () => {
  const { api } = setup("transactions");
  await screen.findByText("示例消费");
  await fireEvent.click(screen.getByRole("button", { name: "展开筛选" }));
  await fireEvent.click(screen.getByRole("combobox", { name: "交易状态" }));
  await fireEvent.click(await screen.findByRole("button", { name: "已退款" }));
  await waitFor(() =>
    expect(api.list).toHaveBeenLastCalledWith({ status: "refund" }, null),
  );
  await fireEvent.click(screen.getByRole("button", { name: "清空全部筛选" }));
  await waitFor(() => expect(router.location.search).toBe(""));
});

it("drills from cash day links into the same half-open day", async () => {
  const { api } = setup("overview");
  await screen.findByText("本期净流入");
  expect(screen.queryByRole("region", { name: "最近交易" })).toBeNull();
  expect(screen.queryByRole("table")).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: "现金流量" }));
  const cashTable = await screen.findByRole("table", { name: "现金流明细" });
  const cashLink = within(cashTable).getByRole("link");
  const params = new URL(cashLink.getAttribute("href")!, "https://example.com")
    .searchParams;
  expect(params.get("cash")).toBe("true");
  expect(
    Date.parse(params.get("end")!) - Date.parse(params.get("start")!),
  ).toBe(86400000);
});

it("opens asset and liability cards in their own balance filters and restores URL state", async () => {
  const { rerender } = setup("overview", false, (api) => {
    vi.mocked(api.report).mockImplementation((async (part) =>
      part === "accounts"
        ? [
            ...overview.accounts,
            {
              id: 3,
              name: "信用卡",
              type: "负债",
              subtype: "信用账户",
              balance: "100.00",
            },
          ]
        : reportParts[part]) as Repository["report"]);
  });
  await fireEvent.click(await screen.findByRole("button", { name: /总资产/ }));
  const assetUrl = router.location.search;
  expect(router.location.pathname).toBe("/");
  expect(new URLSearchParams(assetUrl).get("view")).toBe("assets");
  const region = await screen.findByRole("region", { name: "科目余额" });
  expect(within(region).getByText("银行卡")).toBeTruthy();
  expect(within(region).queryByText("信用卡")).toBeNull();
  expect(
    screen.getByRole("button", { name: "资产" }).getAttribute("aria-pressed"),
  ).toBe("true");
  await fireEvent.click(screen.getByRole("button", { name: "总览" }));
  await fireEvent.click(await screen.findByRole("button", { name: /总负债/ }));
  expect(new URLSearchParams(router.location.search).get("type")).toBe("负债");
  expect(await screen.findByText("信用卡")).toBeTruthy();
  expect(screen.queryByText("银行卡")).toBeNull();
  router.navigate("/" + assetUrl, true, true);
  await screen.findByRole("heading", { name: "总资产" });
  await rerender({ hidden: true });
  expect(document.body.textContent).not.toContain("¥");
  await fireEvent.click(screen.getByRole("button", { name: "全部" }));
  expect(await screen.findByText("银行卡")).toBeTruthy();
  expect(screen.getByText("信用卡")).toBeTruthy();
});

const codedAccounts = [
  {
    id: 10101,
    type: "资产" as const,
    subtype: "现金及等价物",
    name: "银行卡",
    notes: null,
  },
  {
    id: 50101,
    type: "支出" as const,
    subtype: "餐饮",
    name: "餐饮",
    notes: null,
  },
];
it("searches account IDs and saves an edited ID against the original identity", async () => {
  const { api } = setup("accounts", false, (api) =>
    vi.mocked(api.accounts).mockResolvedValue(codedAccounts),
  );
  await screen.findByText("资产");
  await fireEvent.input(screen.getByLabelText("搜索科目"), {
    target: { value: "10101" },
  });
  await fireEvent.click(
    await screen.findByRole("button", { name: /10101.*银行卡/ }),
  );
  await screen.findByRole("dialog", { name: "修改科目" });
  await fireEvent.input(screen.getByLabelText("科目 ID"), {
    target: { value: "10102" },
  });
  await fireEvent.click(screen.getByRole("button", { name: "保存科目" }));
  await waitFor(() =>
    expect(api.saveAccount).toHaveBeenCalledWith(
      10101,
      expect.objectContaining({ id: 10102 }),
    ),
  );
});
it("creates an account with an explicit ID and keeps input on a rejected save", async () => {
  const { api } = setup("accounts", false, (api) => {
    vi.mocked(api.accounts).mockResolvedValue(codedAccounts);
    vi.mocked(api.saveAccount).mockRejectedValueOnce(
      new Error("VALIDATION: 科目 ID 已存在"),
    );
  });
  await screen.findByText("资产");
  await fireEvent.click(screen.getByRole("button", { name: "新增科目" }));
  await fireEvent.input(screen.getByLabelText("科目 ID"), {
    target: { value: "10102" },
  });
  await fireEvent.input(screen.getByLabelText("科目名称"), {
    target: { value: "钱包" },
  });
  await fireEvent.input(screen.getByLabelText("子类"), {
    target: { value: "现金及等价物" },
  });
  await fireEvent.click(screen.getByRole("button", { name: "保存科目" }));
  await screen.findByText("科目 ID 已存在");
  expect((screen.getByLabelText("科目 ID") as HTMLInputElement).value).toBe(
    "10102",
  );
  await fireEvent.click(screen.getByRole("button", { name: "保存科目" }));
  await waitFor(() => expect(api.saveAccount).toHaveBeenCalledTimes(2));
  expect(api.saveAccount).toHaveBeenLastCalledWith(
    null,
    expect.objectContaining({ id: 10102, name: "钱包" }),
  );
});
it("retains a referenced account on delete rejection and deletes only after confirmation", async () => {
  const { api } = setup("accounts", false, (api) => {
    vi.mocked(api.accounts).mockResolvedValue(codedAccounts);
    vi.mocked(api.deleteAccount).mockRejectedValueOnce(
      new Error("VALIDATION: 科目已被交易使用，无法删除"),
    );
  });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await screen.findByText("资产");
  await fireEvent.input(screen.getByLabelText("搜索科目"), {
    target: { value: "10101" },
  });
  await fireEvent.click(
    await screen.findByRole("button", { name: /10101.*银行卡/ }),
  );
  await fireEvent.click(screen.getByRole("button", { name: "删除科目" }));
  expect(api.deleteAccount).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  await fireEvent.click(screen.getByRole("button", { name: "删除科目" }));
  await screen.findByText("科目已被交易使用，无法删除");
  expect(screen.getByRole("dialog", { name: "修改科目" })).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "删除科目" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
