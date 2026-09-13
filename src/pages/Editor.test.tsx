import { afterEach, beforeAll, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Editor from "./Editor";
import type { Account, Payload, Transaction } from "../lib/types";
const accounts: Account[] = [
  { id: 1, type: "支出", subtype: "餐饮", name: "餐饮", notes: null },
  { id: 2, type: "资产", subtype: "现金及等价物", name: "银行卡", notes: null },
];
const t: Transaction = {
  id: 7,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  occurred_at: "2026-09-01T00:00:00Z",
  status: "success",
  payment_method: "direct",
  payment_id: "",
  merchant: "示例消费",
  notes: "",
  complete: true,
  kind: "expense",
  entry_count: 2,
  missing_accounts: 0,
  amount: "100.00",
  entries: [
    { id: 11, account_id: 1, direction: "借", amount: "100.00" },
    { id: 12, account_id: 2, direction: "贷", amount: "100.00" },
  ],
};
const fake = vi.hoisted(() => ({ save: vi.fn(), transaction: vi.fn() }));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  useApi: () => fake,
  useAccounts: () => ({ data: accounts, isPending: false, error: null }),
}));
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
function setup() {
  fake.transaction.mockResolvedValue(t);
  fake.save.mockImplementation(async (id, updatedAt, p: Payload) => ({
    ...t,
    ...p,
  }));
  const router = createMemoryRouter(
    [{ path: "*", element: <Editor hidden={false} /> }],
    { initialEntries: ["/transactions/7"] },
  );
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
it("adds refund entries to the same transaction and saves original entry IDs", async () => {
  setup();
  await screen.findByDisplayValue("示例消费");
  fireEvent.click(screen.getByRole("button", { name: "在本笔交易补记退款" }));
  fireEvent.change(screen.getByLabelText("退款金额"), {
    target: { value: "30.00" },
  });
  fireEvent.click(screen.getByRole("button", { name: "添加退款分录" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "添加退款分录" })).toBeNull(),
  );
  fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
  await waitFor(() => expect(fake.save).toHaveBeenCalledTimes(1));
  const [id, at, p] = fake.save.mock.calls[0];
  expect(id).toBe(7);
  expect(at).toBe(t.updated_at);
  expect(p.entries).toHaveLength(4);
  expect(p.entries.slice(0, 2).map((e: { id: number }) => e.id)).toEqual([
    11, 12,
  ]);
  expect(p.status).toBe("partial_refund");
});
it("keeps user input after a failed save", async () => {
  setup();
  fake.save.mockRejectedValue(new Error("服务暂不可用"));
  await screen.findByDisplayValue("示例消费");
  fireEvent.change(screen.getByLabelText("备注"), {
    target: { value: "保留输入" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^保存$/ }));
  await screen.findByText("服务暂不可用");
  expect((screen.getByLabelText("备注") as HTMLInputElement).value).toBe(
    "保留输入",
  );
});
