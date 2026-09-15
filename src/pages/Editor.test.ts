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
import { accounts, transaction as t } from "../test/fixtures";
import { router } from "../lib/router.svelte";
import type { Repository } from "../lib/api";
import type { Payload } from "../lib/types";
const clients: QueryClient[] = [];
afterEach(() => {
  cleanup();
  clients.forEach((c) => c.clear());
  clients.length = 0;
  vi.restoreAllMocks();
});
function setup(
  path = "/transactions/7",
  configure?: (api: Repository) => void,
) {
  router.navigate(path, true, true);
  const api: Repository = {
    accounts: vi.fn().mockResolvedValue(accounts),
    transaction: vi.fn().mockResolvedValue(t),
    save: vi.fn(async (_id, _at, p: Payload) => ({ ...t, ...p })),
    list: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    balance: vi.fn().mockResolvedValue({
      assets: "100",
      liabilities: "0",
      net_assets: "100",
      cash_closing: "100",
    }),
    cashflow: vi
      .fn()
      .mockResolvedValue({ cash_in: "0", cash_out: "0", cash_net: "0" }),
    overview: vi.fn(),
    report: vi.fn(),
    home: vi.fn(),
    saveAccount: vi.fn(),
  };
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  configure?.(api);
  clients.push(cache);
  render(Harness, { api, cache });
  return api;
}
it("keeps mobile loading, failure and retry in a page with a return action", async () => {
  let fail!: (error: Error) => void;
  setup("/transactions/7?review=needed", (api) => {
    vi.mocked(api.transaction).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    );
  });
  await screen.findByRole("heading", { name: "交易详情" });
  expect(screen.queryByRole("dialog")).toBeNull();
  fail(new Error("详情加载失败"));
  await screen.findByText("详情加载失败");
  expect(screen.getByRole("button", { name: "返回流水" })).toBeTruthy();
  await fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await screen.findByDisplayValue("示例消费");
  expect(screen.queryByRole("dialog")).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: "关闭编辑" }));
  expect(router.location.search).toBe("?review=needed");
});
it("retains a desktop dialog and protects dirty input when Escape is pressed", async () => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: query === "(min-width: 640px)",
        media: query,
        addEventListener() {},
        removeEventListener() {},
        onchange: null,
        addListener() {},
        removeListener() {},
        dispatchEvent: () => true,
      }) as MediaQueryList,
  );
  setup();
  await screen.findByDisplayValue("示例消费");
  const dialog = screen.getByRole("dialog", { name: "补录交易信息" });
  await fireEvent.input(screen.getByLabelText("商户 / 交易摘要"), {
    target: { value: "保留输入" },
  });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await fireEvent.keyDown(dialog, { key: "Escape" });
  expect(confirm).toHaveBeenCalled();
  expect(router.location.pathname).toBe("/transactions/7");
  expect(screen.getByDisplayValue("保留输入")).toBeTruthy();
});
it("adds refund to the same transaction and preserves original entry IDs", async () => {
  const api = setup();
  await screen.findByDisplayValue("示例消费");
  await fireEvent.click(screen.getByRole("button", { name: "交易操作" }));
  await fireEvent.click(screen.getByRole("button", { name: "补记退款" }));
  await fireEvent.input(await screen.findByLabelText("退款金额"), {
    target: { value: "30.00" },
  });
  await fireEvent.click(screen.getByRole("button", { name: "添加退款分录" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "添加退款分录" })).toBeNull(),
  );
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "保存补录" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  await fireEvent.click(screen.getByRole("button", { name: "保存补录" }));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  const [id, at, p] = vi.mocked(api.save).mock.calls[0];
  expect(id).toBe(7);
  expect(at).toBe(t.updated_at);
  expect(p.entries).toHaveLength(4);
  expect(p.entries.slice(0, 2).map((e) => e.id)).toEqual([11, 12]);
  expect(p.status).toBe("partial_refund");
});
it("uses compact category/account fields and synchronizes an edited amount without replacing IDs", async () => {
  const api = setup();
  await screen.findByRole("combobox", { name: "分类" });
  expect(screen.getByRole("combobox", { name: "账户" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "分录明细" })).toBeNull();
  await fireEvent.input(screen.getByLabelText("金额（人民币）"), {
    target: { value: "25.30" },
  });
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "保存补录" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  await fireEvent.click(screen.getByRole("button", { name: "保存补录" }));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  expect(vi.mocked(api.save).mock.calls[0][2].entries).toEqual(
    t.entries.map((e) => ({ ...e, amount: "25.30" })),
  );
});
it("keeps invalid amount input in the compact form and rejects saving it", async () => {
  const api = setup();
  const field = await screen.findByLabelText("金额（人民币）");
  await fireEvent.input(field, { target: { value: "1.234" } });
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "保存补录" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  await fireEvent.click(screen.getByRole("button", { name: "保存补录" }));
  expect(api.save).not.toHaveBeenCalled();
  expect(
    (screen.getByLabelText("金额（人民币）") as HTMLInputElement).value,
  ).toBe("1.234");
  expect(screen.getByRole("combobox", { name: "分类" })).toBeTruthy();
});
it("switches transaction direction while preserving the payment account and entry identities", async () => {
  const api = setup("/transactions/7", (api) =>
    vi
      .mocked(api.accounts)
      .mockResolvedValue([
        ...accounts,
        { id: 3, type: "收入", subtype: "薪酬", name: "工资", notes: null },
      ]),
  );
  await screen.findByRole("combobox", { name: "分类" });
  await fireEvent.click(screen.getByRole("button", { name: "收入" }));
  await fireEvent.click(screen.getByRole("combobox", { name: "分类" }));
  await fireEvent.click(await screen.findByRole("option", { name: /薪酬/ }));
  await fireEvent.click(await screen.findByRole("option", { name: "工资" }));
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "保存补录" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  await fireEvent.click(screen.getByRole("button", { name: "保存补录" }));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  expect(vi.mocked(api.save).mock.calls[0][2].entries).toEqual([
    { ...t.entries[0], account_id: 3, direction: "贷" },
    { ...t.entries[1], direction: "借" },
  ]);
});
it("applies real same-merchant account suggestions only on request", async () => {
  const api = setup("/transactions/7", (api) => {
    vi.mocked(api.accounts).mockResolvedValue([
      ...accounts,
      { id: 3, type: "支出", subtype: "餐饮", name: "外卖", notes: null },
    ]);
    vi.mocked(api.list).mockResolvedValue({
      items: [
        {
          ...t,
          id: 8,
          entries: [
            { ...t.entries[0], id: 31, account_id: 3 },
            { ...t.entries[1], id: 32 },
          ],
        },
      ],
      next_cursor: null,
    });
  });
  await screen.findByRole("button", { name: "一键应用" });
  expect(screen.getByRole("combobox", { name: "分类" }).textContent).toContain(
    "餐饮",
  );
  await fireEvent.click(screen.getByRole("button", { name: "一键应用" }));
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "保存补录" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  await fireEvent.click(screen.getByRole("button", { name: "保存补录" }));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  expect(vi.mocked(api.save).mock.calls[0][2].entries.map((e) => e.id)).toEqual(
    [11, 12],
  );
  expect(vi.mocked(api.save).mock.calls[0][2].entries[0].account_id).toBe(3);
});
it("keeps a complex transaction in the full entry editor without flattening it", async () => {
  const complex = {
    ...t,
    entries: [
      ...t.entries,
      { id: 13, account_id: 2, direction: "借" as const, amount: "1.00" },
    ],
  };
  const api = setup("/transactions/7", (api) =>
    vi.mocked(api.transaction).mockResolvedValue(complex),
  );
  await screen.findByRole("heading", { name: "分录明细" });
  expect(screen.queryByRole("combobox", { name: "分类" })).toBeNull();
  expect(
    await screen.findAllByRole("combobox", { name: "会计科目" }),
  ).toHaveLength(3);
  expect(api.save).not.toHaveBeenCalled();
});
it("keeps input after failed save and allows a confirmed failure to retry", async () => {
  const api = setup();
  vi.mocked(api.save).mockRejectedValue(new Error("服务暂不可用"));
  await screen.findByDisplayValue("示例消费");
  await fireEvent.input(screen.getByLabelText("备注"), {
    target: { value: "保留输入" },
  });
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "保存补录" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  await fireEvent.click(screen.getByRole("button", { name: "保存补录" }));
  await screen.findByText("服务暂不可用");
  expect((screen.getByLabelText("备注") as HTMLTextAreaElement).value).toBe(
    "保留输入",
  );
  expect(
    (screen.getByRole("button", { name: "保存补录" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
it("blocks duplicate saves when the network leaves the result uncertain", async () => {
  const api = setup();
  vi.mocked(api.save).mockRejectedValue(new Error("Failed to fetch"));
  await screen.findByDisplayValue("示例消费");
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "保存补录" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  await fireEvent.click(screen.getByRole("button", { name: "保存补录" }));
  await screen.findByText(/保存待核对/);
  expect(
    (screen.getByRole("button", { name: "保存补录" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(api.save).toHaveBeenCalledTimes(1);
});
it("preserves filter URLs and asks before discarding edits", async () => {
  setup("/transactions/7?review=needed");
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await screen.findByDisplayValue("示例消费");
  await fireEvent.input(screen.getByLabelText("备注"), {
    target: { value: "未保存" },
  });
  await fireEvent.click(screen.getByRole("button", { name: "关闭编辑" }));
  expect(confirm).toHaveBeenCalled();
  expect(router.location.pathname).toBe("/transactions/7");
  confirm.mockReturnValue(true);
  await fireEvent.click(screen.getByRole("button", { name: "关闭编辑" }));
  expect(router.location).toEqual({
    pathname: "/transactions",
    search: "?review=needed",
  });
});
it("rejects invalid IDs without requesting a transaction", async () => {
  const api = setup("/transactions/not-a-number");
  await screen.findByText("无效的交易编号。");
  expect(api.transaction).not.toHaveBeenCalled();
});
it("keeps the saved record identity if loading the next record fails", async () => {
  const api = setup();
  vi.mocked(api.list).mockRejectedValue(new Error("Failed to fetch"));
  await screen.findByDisplayValue("示例消费");
  await fireEvent.click(screen.getByRole("button", { name: "交易操作" }));
  await fireEvent.click(screen.getByRole("button", { name: "保存并下一笔" }));
  await screen.findByText(/已保存，下一笔加载失败/);
  expect(screen.queryByText(/保存待核对/)).toBeNull();
  expect(
    (screen.getByRole("button", { name: "保存补录" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
it("searches and selects an account using the Bits UI picker", async () => {
  const api = setup();
  await screen.findByDisplayValue("示例消费");
  await fireEvent.click(screen.getByRole("button", { name: "交易操作" }));
  await fireEvent.click(screen.getByRole("button", { name: "分录明细" }));
  await fireEvent.click(
    (await screen.findAllByRole("combobox", { name: "会计科目" }))[0],
  );
  const search = await screen.findByRole("combobox", { name: "搜索会计科目" });
  await fireEvent.input(search, { target: { value: "银行卡" } });
  const option = await screen.findByRole("option", {
    name: /现金及等价物 \/ 银行卡/,
  });
  await fireEvent.click(option);
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "保存补录" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  await fireEvent.click(screen.getByRole("button", { name: "保存补录" }));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  expect(vi.mocked(api.save).mock.calls[0][2].entries[0].account_id).toBe(2);
});
it("shows refund validation in the active dialog", async () => {
  setup();
  await screen.findByDisplayValue("示例消费");
  await fireEvent.click(screen.getByRole("button", { name: "交易操作" }));
  await fireEvent.click(screen.getByRole("button", { name: "补记退款" }));
  await fireEvent.input(await screen.findByLabelText("退款金额"), {
    target: { value: "101.00" },
  });
  await fireEvent.click(screen.getByRole("button", { name: "添加退款分录" }));
  const dialog = screen.getByRole("dialog", { name: "补记退款" });
  expect(within(dialog).getByText("退款金额不能超过当前净支出")).toBeTruthy();
});

const salaryAccounts = [
  ...accounts,
  { id: 3, type: "收入" as const, subtype: "工资", name: "月薪", notes: null },
  {
    id: 4,
    type: "支出" as const,
    subtype: "税费",
    name: "个人所得税",
    notes: null,
  },
  {
    id: 5,
    type: "资产" as const,
    subtype: "现金及等价物",
    name: "另一银行卡",
    notes: null,
  },
  {
    id: 6,
    type: "净资产" as const,
    subtype: "期初",
    name: "期初权益",
    notes: null,
  },
];
async function pick(label: string, group: string, item: string) {
  await fireEvent.click(screen.getByRole("combobox", { name: label }));
  await fireEvent.click(
    await screen.findByRole("option", { name: new RegExp(group) }),
  );
  await fireEvent.click(await screen.findByRole("option", { name: item }));
}
it("records gross salary, tax and net receipts in the same transaction with original IDs", async () => {
  const api = setup("/transactions/7", (api) =>
    vi.mocked(api.accounts).mockResolvedValue(salaryAccounts),
  );
  await screen.findByRole("combobox", { name: "分类" });
  await fireEvent.click(screen.getByRole("button", { name: "收入" }));
  await fireEvent.click(screen.getByRole("combobox", { name: "分类" }));
  const dialog = await screen.findByRole("dialog", { name: "选择分类" });
  expect(within(dialog).queryByText("资产")).toBeNull();
  expect(within(dialog).queryByText("净资产")).toBeNull();
  expect(within(dialog).queryByText("税费")).toBeNull();
  expect(within(dialog).queryByRole("option", { name: "月薪" })).toBeNull();
  await fireEvent.click(within(dialog).getByRole("option", { name: /工资/ }));
  await fireEvent.click(await screen.findByRole("option", { name: "月薪" }));
  await fireEvent.input(screen.getByLabelText("金额（人民币）"), {
    target: { value: "10000" },
  });
  await fireEvent.click(screen.getByRole("button", { name: "添加扣款" }));
  await pick("扣款 1", "税费", "个人所得税");
  await fireEvent.input(screen.getByLabelText("扣款金额 1"), {
    target: { value: "500" },
  });
  expect(
    (screen.getByLabelText("到账账户金额 1") as HTMLInputElement).value,
  ).toBe("9500.00");
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "保存补录" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  await fireEvent.click(screen.getByRole("button", { name: "保存补录" }));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  expect(vi.mocked(api.save).mock.calls[0][2].entries).toEqual([
    { id: 11, account_id: 3, direction: "贷", amount: "10000" },
    { id: 12, account_id: 2, direction: "借", amount: "9500.00" },
    { account_id: 4, direction: "借", amount: "500" },
  ]);
});
it("reopens salary splits as business fields and prevents saving an allocation gap", async () => {
  const salary = {
    ...t,
    kind: "income" as const,
    entries: [
      { id: 11, account_id: 3, direction: "贷" as const, amount: "10000" },
      { id: 12, account_id: 2, direction: "借" as const, amount: "9500" },
      { id: 13, account_id: 4, direction: "借" as const, amount: "500" },
    ],
  };
  const api = setup("/transactions/7", (api) => {
    vi.mocked(api.accounts).mockResolvedValue(salaryAccounts);
    vi.mocked(api.transaction).mockResolvedValue(salary);
  });
  await screen.findByLabelText("扣款金额 1");
  expect(screen.queryByRole("heading", { name: "分录明细" })).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: "添加账户" }));
  await pick("到账账户 2", "现金及等价物", "另一银行卡");
  await fireEvent.input(screen.getByLabelText("到账账户金额 2"), {
    target: { value: "3000" },
  });
  expect(
    (screen.getByRole("button", { name: "保存补录" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await fireEvent.input(screen.getByLabelText("到账账户金额 1"), {
    target: { value: "6500" },
  });
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "保存补录" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  await fireEvent.click(screen.getByRole("button", { name: "保存补录" }));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  const entries = vi.mocked(api.save).mock.calls[0][2].entries;
  expect(entries.map((e) => e.id)).toEqual([11, 12, 13, undefined]);
  expect(entries.map((e) => e.amount)).toEqual([
    "10000",
    "6500",
    "500",
    "3000",
  ]);
});
it("retains edits offline and enables saving when connectivity returns", async () => {
  const api = setup();
  await screen.findByDisplayValue("示例消费");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  await fireEvent(window, new Event("offline"));
  expect(
    (screen.getByRole("button", { name: "保存补录" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await fireEvent.input(screen.getByLabelText("备注"), {
    target: { value: "离线填写" },
  });
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  await fireEvent(window, new Event("online"));
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "保存补录" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  await fireEvent.click(screen.getByRole("button", { name: "保存补录" }));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  expect(vi.mocked(api.save).mock.calls[0][2].notes).toBe("离线填写");
});

it("splits an expense between categories and recalculates its sole payment account", async () => {
  const api = setup("/transactions/7", (api) =>
    vi.mocked(api.accounts).mockResolvedValue(salaryAccounts),
  );
  await screen.findByRole("combobox", { name: "分类" });
  await fireEvent.click(screen.getByRole("button", { name: "拆分分类" }));
  await pick("分类 2", "税费", "个人所得税");
  await fireEvent.input(screen.getByLabelText("分类金额 1"), {
    target: { value: "40.10" },
  });
  await fireEvent.input(screen.getByLabelText("分类金额 2"), {
    target: { value: "59.90" },
  });
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "保存补录" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  await fireEvent.click(screen.getByRole("button", { name: "保存补录" }));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  expect(vi.mocked(api.save).mock.calls[0][2].entries).toEqual([
    { ...t.entries[0], amount: "40.10" },
    { ...t.entries[1], amount: "100.00" },
    { account_id: 4, direction: "借", amount: "59.90" },
  ]);
});
it("records a transfer with correctly directed accounts and restores focus after selecting", async () => {
  const api = setup("/transactions/7", (api) =>
    vi.mocked(api.accounts).mockResolvedValue(salaryAccounts),
  );
  await screen.findByRole("combobox", { name: "分类" });
  await fireEvent.click(screen.getByRole("button", { name: "转账" }));
  await pick("转入账户 1", "现金及等价物", "另一银行卡");
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("combobox", { name: "转入账户 1" }),
    ),
  );
  await fireEvent.input(screen.getByLabelText("转出账户金额 1"), {
    target: { value: "80.01" },
  });
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "保存补录" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  await fireEvent.click(screen.getByRole("button", { name: "保存补录" }));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  expect(vi.mocked(api.save).mock.calls[0][2].entries).toEqual([
    { id: 11, account_id: 5, direction: "借", amount: "80.01" },
    { id: 12, account_id: 2, direction: "贷", amount: "80.01" },
  ]);
});
it("opens zero-entry history without dirtying it and starts a pair only on request", async () => {
  const api = setup("/transactions/7", (api) =>
    vi
      .mocked(api.transaction)
      .mockResolvedValue({ ...t, entries: [], complete: false, amount: null }),
  );
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await screen.findByRole("button", { name: "开始补录" });
  await fireEvent.click(screen.getByRole("button", { name: "关闭编辑" }));
  expect(confirm).not.toHaveBeenCalled();
  expect(api.save).not.toHaveBeenCalled();
});
it("disables saving when account loading fails", async () => {
  const api = setup("/transactions/7", (api) =>
    vi.mocked(api.accounts).mockRejectedValue(new Error("科目加载失败")),
  );
  await screen.findByText("科目加载失败");
  expect(
    (screen.getByRole("button", { name: "保存补录" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(api.save).not.toHaveBeenCalled();
});
