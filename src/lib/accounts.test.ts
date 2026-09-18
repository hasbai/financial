import { expect, it } from "vitest";
import { accountGroups, accountIdError } from "./accounts";
import type { Account } from "./types";
const accounts: Account[] = [
  { id: 10101, type: "资产", subtype: "现金", name: "银行卡", notes: null },
  { id: 10102, type: "资产", subtype: "现金", name: "钱包", notes: null },
  { id: 50101, type: "支出", subtype: "餐饮", name: "午餐", notes: null },
];
it("validates identity, type and existing subtype codes without rejecting the original ID", () => {
  expect(accountIdError("1234", "资产", "现金", accounts, null)).toContain(
    "五位",
  );
  expect(accountIdError("20101", "资产", "现金", accounts, null)).toContain(
    "首位",
  );
  expect(accountIdError("10101", "资产", "现金", accounts, null)).toContain(
    "已存在",
  );
  expect(accountIdError("10201", "资产", "现金", accounts, 10101)).toContain(
    "前三位",
  );
  expect(accountIdError("10101", "资产", "现金", accounts, 10101)).toBe("");
  expect(accountIdError("10103", "资产", "现金", accounts, 10101)).toBe("");
  expect(accountIdError("10201", "资产", "投资", accounts, null)).toBe("");
});
it("orders categories and leaf IDs and retains two collapsible levels", () => {
  const groups = accountGroups([...accounts].reverse());
  expect(groups.map((g) => g.type)).toEqual(["资产", "支出"]);
  expect(groups[0].subtypes[0].items.map((a) => a.id)).toEqual([10101, 10102]);
  expect(accountGroups([])).toEqual([]);
});
