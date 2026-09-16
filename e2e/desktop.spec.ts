import { test, expect, fitsViewport } from "./fixtures";

test("desktop overview and keyboard editor dialog", async ({ page, app }) => {
  await app.open();
  await expect(page.getByRole("heading", { name: "净资产" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "主要导航" }),
  ).toBeVisible();
  await expect(page.getByRole("navigation", { name: "移动导航" })).toBeHidden();
  await fitsViewport(page);
  await expect(page).toHaveScreenshot("overview.png", { fullPage: true });
  await page.getByRole("link", { name: "记一笔" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "新增交易" })).toBeVisible();
  await expect(page).toHaveScreenshot("editor-dialog.png");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Escape preserves dirty editor input when discard is declined", async ({
  page,
  app,
}) => {
  await app.open("/transactions/7");
  await expect(
    page.getByRole("dialog", { name: "补录交易信息" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "商户 / 交易摘要" }).fill("保留输入");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "补录交易信息" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "商户 / 交易摘要" }),
  ).toHaveValue("保留输入");
});
