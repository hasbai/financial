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
function setup(path = "/transactions/7") {
  router.navigate(path, true, true);
  const api: Repository = {
    accounts: vi.fn().mockResolvedValue(accounts),
    transaction: vi.fn().mockResolvedValue(t),
    save: vi.fn(async (_id, _at, p: Payload) => ({ ...t, ...p })),
    list: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    overview: vi.fn(),
    saveAccount: vi.fn(),
  };
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(cache);
  render(Harness, { api, cache });
  return api;
}
it("adds refund to the same transaction and preserves original entry IDs", async () => {
  const api = setup();
  await screen.findByDisplayValue("示例消费");
  await fireEvent.click(
    screen.getByRole("button", { name: "在本笔交易补记退款" }),
  );
  await fireEvent.input(await screen.findByLabelText("退款金额"), {
    target: { value: "30.00" },
  });
  await fireEvent.click(screen.getByRole("button", { name: "添加退款分录" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "添加退款分录" })).toBeNull(),
  );
  await fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  const [id, at, p] = vi.mocked(api.save).mock.calls[0];
  expect(id).toBe(7);
  expect(at).toBe(t.updated_at);
  expect(p.entries).toHaveLength(4);
  expect(p.entries.slice(0, 2).map((e) => e.id)).toEqual([11, 12]);
  expect(p.status).toBe("partial_refund");
});
it("keeps input after failed save and allows a confirmed failure to retry", async () => {
  const api = setup();
  vi.mocked(api.save).mockRejectedValue(new Error("服务暂不可用"));
  await screen.findByDisplayValue("示例消费");
  await fireEvent.input(screen.getByLabelText("备注"), {
    target: { value: "保留输入" },
  });
  await fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
  await screen.findByText("服务暂不可用");
  expect((screen.getByLabelText("备注") as HTMLTextAreaElement).value).toBe(
    "保留输入",
  );
  expect(
    (screen.getByRole("button", { name: /^保存$/ }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
it("blocks duplicate saves when the network leaves the result uncertain", async () => {
  const api = setup();
  vi.mocked(api.save).mockRejectedValue(new Error("Failed to fetch"));
  await screen.findByDisplayValue("示例消费");
  await fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
  await screen.findByText(/保存结果尚未确认/);
  expect(
    (screen.getByRole("button", { name: /^保存$/ }) as HTMLButtonElement)
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
  await fireEvent.click(screen.getByRole("button", { name: "保存并下一笔" }));
  await screen.findByText(/本笔已保存，刷新或加载下一笔失败/);
  expect(screen.queryByText(/保存结果尚未确认/)).toBeNull();
  expect(
    (screen.getByRole("button", { name: /^保存$/ }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
it("searches and selects an account using the Bits UI picker", async () => {
  const api = setup();
  await screen.findByDisplayValue("示例消费");
  await fireEvent.click(
    (await screen.findAllByRole("combobox", { name: "会计科目" }))[0],
  );
  const search = await screen.findByRole("combobox", { name: "搜索会计科目" });
  await fireEvent.input(search, { target: { value: "银行卡" } });
  const option = await screen.findByRole("option", {
    name: /现金及等价物 \/ 银行卡/,
  });
  await fireEvent.click(option);
  await fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  expect(vi.mocked(api.save).mock.calls[0][2].entries[0].account_id).toBe(2);
});
it("shows refund validation in the active dialog", async () => {
  setup();
  await screen.findByDisplayValue("示例消费");
  await fireEvent.click(
    screen.getByRole("button", { name: "在本笔交易补记退款" }),
  );
  await fireEvent.input(await screen.findByLabelText("退款金额"), {
    target: { value: "101.00" },
  });
  await fireEvent.click(screen.getByRole("button", { name: "添加退款分录" }));
  const dialog = screen.getByRole("dialog", { name: "补记退款" });
  expect(within(dialog).getByText("退款金额不能超过当前净支出")).toBeTruthy();
});
