import { test, expect, fitsViewport, reachable } from "./fixtures";

for (const state of ["loading", "empty", "error"] as const) {
  test(`transactions ${state}`, async ({ page, app }) => {
    await app.open("/transactions", state);
    if (state === "loading")
      await expect(page.getByRole("status").first()).toBeVisible();
    if (state === "empty")
      await expect(
        page.getByRole("heading", { name: "暂无交易" }),
      ).toBeVisible();
    if (state === "error")
      await expect(page.getByRole("alert").first()).toContainText("加载失败");
    await expect(page).toHaveScreenshot(`transactions-${state}.png`, {
      fullPage: true,
    });
    if (state === "error") {
      app.recover();
      await page.getByRole("button", { name: "重试" }).first().click();
      await page.getByRole("button", { name: "重试" }).click();
      await expect(page.getByText("示例消费", { exact: true })).toBeVisible();
    }
    if (state === "empty") {
      await page.getByRole("link", { name: "记一笔" }).first().click();
      await expect(
        page.getByRole("heading", { name: "新增交易" }),
      ).toBeVisible();
    }
  });
}

test("reduced viewport keeps editor field and save action reachable", async ({
  page,
  app,
}) => {
  await app.open("/transactions/7");
  await expect(
    page.getByRole("heading", { name: "补录交易信息" }),
  ).toBeVisible();
  // Exercises VisualViewport resize; this is not an emulated iOS software keyboard.
  await expect(page.locator("html")).toHaveCSS(
    "--visual-height",
    `${page.viewportSize()!.height}px`,
  );
  const notes = page.getByRole("textbox", { name: "备注", exact: true });
  await notes.click();
  await expect(notes).toBeFocused();
  await page.setViewportSize({ width: 390, height: 420 });
  await expect(page.locator("html")).toHaveCSS("--visual-height", "420px");
  await notes.fill("自动化输入");
  await expect(notes).toBeFocused();
  await expect(notes).toBeInViewport();
  await reachable(page.getByRole("button", { name: "保存补录" }));
  await fitsViewport(page);
  await expect(page).toHaveScreenshot("editor-reduced-viewport.png");
});

test("account create keeps input after failure and saves on retry", async ({
  page,
  app,
}) => {
  await app.open("/accounts");
  await page.getByRole("button", { name: "新增科目" }).click();
  await page.getByRole("textbox", { name: "科目名称" }).fill("日常账户");
  await page
    .getByRole("textbox", { name: "子类", exact: true })
    .fill("现金及等价物");
  await page.route(
    "**/test-api/rpc/save_account",
    (route) =>
      route.fulfill({
        status: 400,
        json: { code: "VALIDATION", message: "保存失败" },
      }),
    { times: 1 },
  );
  await page.getByRole("button", { name: "保存科目" }).click();
  await expect(page.getByRole("alert")).toContainText("保存失败");
  await expect(page.getByRole("textbox", { name: "科目名称" })).toHaveValue(
    "日常账户",
  );
  await expect(page).toHaveScreenshot("account-save-error.png");
  const request = page.waitForRequest("**/test-api/rpc/save_account");
  await page.getByRole("button", { name: "保存科目" }).click();
  expect((await request).postDataJSON()).toMatchObject({
    p_id: null,
    p_payload: { name: "日常账户", type: "资产" },
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

for (const route of [
  { name: "overview", path: "/", empty: "未设置现金账户" },
  { name: "accounts", path: "/accounts", empty: "没有匹配的科目" },
  {
    name: "editor",
    path: "/transactions/7",
    empty: "记录不存在或没有访问权限。",
  },
]) {
  for (const state of ["loading", "empty", "error"] as const) {
    test(`${route.name} ${state}`, async ({ page, app }) => {
      await app.open(route.path, state);
      if (state === "loading")
        await expect(page.getByRole("status").first()).toBeVisible();
      if (state === "empty")
        await expect(
          page.getByText(route.empty, { exact: true }),
        ).toBeVisible();
      if (state === "error")
        await expect(page.getByRole("alert").first()).toContainText("加载失败");
      await fitsViewport(page);
      await expect(page).toHaveScreenshot(`${route.name}-${state}.png`, {
        fullPage: true,
      });
      if (route.name === "editor" && state === "error") {
        app.recover();
        await page.getByRole("button", { name: "重试" }).click();
        await expect(
          page.getByRole("heading", { name: "补录交易信息" }),
        ).toBeVisible();
      }
    });
  }
}
