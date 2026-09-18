import type { Account } from "./types";

export const accountTypes = ["资产", "负债", "净资产", "收入", "支出"] as const;
export function accountIdError(
  id: string,
  type: Account["type"],
  subtype: string,
  accounts: Account[],
  originalId: number | null,
) {
  if (!/^[1-5][0-9]{4}$/.test(id)) return "科目 ID 必须为五位数字";
  if (Number(id[0]) !== accountTypes.indexOf(type) + 1)
    return "科目 ID 首位与类型不符";
  if (accounts.some((a) => a.id === Number(id) && a.id !== originalId))
    return "科目 ID 已存在";
  const sibling = accounts.find(
    (a) =>
      a.id !== originalId && a.type === type && a.subtype === subtype.trim(),
  );
  if (sibling && String(sibling.id).slice(0, 3) !== id.slice(0, 3))
    return "科目 ID 前三位与子类不符";
  return "";
}
export function accountGroups(accounts: Account[]) {
  return accountTypes.flatMap((type, index) => {
    const items = accounts
      .filter((a) => a.type === type)
      .sort((a, b) => a.id - b.id);
    const subtypes = [...new Set(items.map((a) => a.subtype))].map((name) => {
      const children = items.filter((a) => a.subtype === name);
      return {
        name,
        prefix: String(children[0].id).slice(0, 3),
        items: children,
      };
    });
    return items.length
      ? [{ type, code: index + 1, count: items.length, subtypes }]
      : [];
  });
}
