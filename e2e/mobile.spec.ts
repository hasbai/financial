import { test, expect, fitsViewport, reachable } from "./fixtures";

test("overview, privacy and dark appearance", async ({ page, app }) => {
  await app.open();
  await expect(page.getByRole("heading", { name: "净资产" })).toBeVisible();
  await expect(page.getByText("¥10,045.67")).toBeVisible();
  await reachable(page.getByRole("link", { name: "记一笔" }));
  await fitsViewport(page);
  await expect(page).toHaveScreenshot("overview.png", { fullPage: true });
  await page.getByRole("button", { name: "隐藏金额" }).click();
  await expect(page.locator("main")).not.toContainText("¥");
  await expect(page.getByRole("img", { name: /柱状图|趋势/ })).toHaveCount(0);
  await page.getByRole("button", { name: "应用菜单" }).click();
  await page.getByRole("button", { name: "深色外观" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("html")).toHaveClass("dark");
  await expect(page).toHaveScreenshot("overview-private-dark.png", {
    fullPage: true,
  });
});

test("transaction list opens a mobile editor and searchable account picker", async ({
  page,
  app,
}) => {
  await app.open("/transactions");
  await expect(page.getByText("示例消费", { exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot("transactions.png", { fullPage: true });
  await page.getByRole("link", { name: /示例消费/ }).click();
  await expect(
    page.getByRole("heading", { name: "补录交易信息" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "移动导航" })).toBeHidden();
  await reachable(page.getByRole("button", { name: "保存补录" }));
  await fitsViewport(page);
  await expect(page).toHaveScreenshot("editor.png");
  const category = page.getByRole("combobox", { name: "分类", exact: true });
  await category.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveScreenshot("account-picker.png");
  await page.getByRole("combobox", { name: "搜索分类" }).fill("餐饮");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(category).toBeFocused();
});

test("settings, accounts and new transaction navigation", async ({
  page,
  app,
}) => {
  await app.open("/settings");
  await page.getByRole("link", { name: "科目", exact: true }).click();
  await expect(page.getByRole("heading", { name: "科目设置" })).toBeVisible();
  await expect(page.getByRole("button", { name: /银行卡/ })).toBeVisible();
  await fitsViewport(page);
  await expect(page).toHaveScreenshot("accounts.png", { fullPage: true });
  await page.getByRole("link", { name: "返回设置" }).click();
  await page.getByRole("link", { name: "记一笔" }).click();
  await expect(page.getByRole("heading", { name: "新增交易" })).toBeVisible();
  await reachable(page.getByRole("button", { name: "保存交易" }));
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
