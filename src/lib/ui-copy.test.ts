import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";

it("does not reintroduce explanatory UI copy in any business page or shared component", () => {
  const files = [
    "src/Shell.svelte",
    ...["src/pages", "src/components"].flatMap((dir) =>
      readdirSync(dir)
        .filter((name) => name.endsWith(".svelte"))
        .map((name) => `${dir}/${name}`),
    ),
  ];
  const forbidden =
    /以下仅反映|期初覆盖|完整记录口径|已记录资产余额|已记录负债余额|现金内部转账|同笔退款冲减|不重复计入|仅汇总已录入|不含待处理记录|自动计入现金流|金额统一为人民币|以下修改保存后|支出：借记|关闭后恢复隐藏|维护名称、类型|先去核对流水|各区间含起始|基于商户信息为你推荐/;
  for (const file of files)
    expect(readFileSync(file, "utf8"), file).not.toMatch(forbidden);
});
