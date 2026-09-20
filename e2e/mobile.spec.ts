import {
  test,
  expect,
  fitsViewport,
  reachable,
  sheetFitsViewport,
} from "./fixtures";

test("shipping styles hide mobile scrollbars without disabling scrolling", async ({
  page,
  app,
}) => {
  await app.open("/transactions/new");
  await expect(
    page.locator('link[rel="stylesheet"][href^="/production-assets/"]'),
  ).toHaveCount(1);
  const scroll = page.locator(".editor-scroll");
  await expect(page.locator("html")).toHaveCSS("scrollbar-width", "none");
  await expect(scroll).toHaveCSS("scrollbar-width", "none");
  await expect(scroll).toHaveCSS("overflow-y", "auto");
  const paymentId = page.getByRole("textbox", { name: "支付流水号" });
  await paymentId.scrollIntoViewIfNeeded();
  await reachable(paymentId);
  expect(await scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await page.getByRole("combobox", { name: "账户", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await sheetFitsViewport(dialog);
  await expect(dialog).toHaveCSS("scrollbar-width", "none");
  await expect(dialog.locator('[data-slot="command-list"]')).toHaveCSS(
    "scrollbar-width",
    "none",
  );
  await page.keyboard.press("Escape");
  await reachable(page.getByRole("button", { name: "保存交易" }));
});

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
  await expect(page.getByRole("heading", { name: "示例消费" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "移动导航" })).toBeHidden();
  await expect(page.getByRole("combobox", { name: "交易状态" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "支付渠道" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "支付流水号" })).toBeVisible();
  await expect(page.getByText("科目建议", { exact: true })).toHaveCount(0);
  await reachable(page.getByRole("button", { name: "保存修改" }));
  await fitsViewport(page);
  await expect(page).toHaveScreenshot("editor.png");
  const category = page.getByRole("combobox", { name: "分类", exact: true });
  await category.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await sheetFitsViewport(page.getByRole("dialog"));
  await expect(page).toHaveScreenshot("account-picker.png");
  await page.getByRole("combobox", { name: "搜索分类" }).fill("餐饮");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(category).toBeFocused();
});

test("new transaction category and payment sheets remain reachable after scrolling and resizing", async ({
  page,
  app,
}) => {
  await app.open("/transactions/new");
  const title = page.getByRole("heading", { name: "新增交易" });
  await expect(title).toHaveCSS("font-size", "18px");
  await expect(page.getByText("待填写", { exact: true })).toHaveCSS(
    "font-size",
    "16px",
  );
  await expect(page).toHaveScreenshot("new-transaction.png");
  for (const [label, choice] of [
    ["分类", "餐饮"],
    ["账户", "银行卡"],
  ]) {
    const trigger = page.getByRole("combobox", { name: label, exact: true });
    await trigger.scrollIntoViewIfNeeded();
    await reachable(trigger);
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await sheetFitsViewport(dialog);
    const search = dialog.getByRole("combobox", { name: `搜索${label}` });
    await expect(dialog).toBeFocused();
    await expect(search).not.toBeFocused();
    await expect(search).toHaveCSS("font-size", "16px");
    await reachable(search);
    await expect(page).toHaveScreenshot(
      label === "分类" ? "new-category-sheet.png" : "new-payment-sheet.png",
    );
    const original = page.viewportSize()!;
    await page.setViewportSize({ width: original.width, height: 360 });
    await sheetFitsViewport(dialog);
    await reachable(search);
    await search.fill(choice);
    const option = dialog.getByRole("option", { name: new RegExp(choice) });
    await reachable(option);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toContainText(choice);
    await page.setViewportSize(original);
  }
  await page.getByRole("button", { name: "拆分分类" }).click();
  await page.getByRole("button", { name: "添加账户" }).click();
  for (const label of ["分类 2", "付款账户 2"]) {
    const trigger = page.getByRole("combobox", { name: label, exact: true });
    await trigger.scrollIntoViewIfNeeded();
    await reachable(trigger);
    await trigger.click();
    await sheetFitsViewport(page.getByRole("dialog"));
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  await reachable(page.getByRole("button", { name: "保存交易" }));
  await fitsViewport(page);
});

test("income, transfers and advanced entries share bounded account sheets", async ({
  page,
  app,
}) => {
  await app.open("/transactions/new");
  await page.getByRole("button", { name: "收入", exact: true }).click();
  await page.getByRole("button", { name: "添加扣款" }).click();
  for (const label of ["分类", "账户", "扣款 1"]) {
    await page.getByRole("combobox", { name: label, exact: true }).click();
    await sheetFitsViewport(page.getByRole("dialog"));
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "删除扣款 1" }).click();
  await page.getByRole("button", { name: "划转", exact: true }).click();
  for (const label of ["转出账户 1", "转入账户 1"]) {
    await page.getByRole("combobox", { name: label, exact: true }).click();
    await sheetFitsViewport(page.getByRole("dialog"));
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "交易操作" }).click();
  await page.getByRole("button", { name: "分录明细", exact: true }).click();
  await page
    .getByRole("combobox", { name: "会计科目", exact: true })
    .last()
    .click();
  await sheetFitsViewport(page.getByRole("dialog"));
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "方向 2", exact: true }).click();
  await sheetFitsViewport(page.getByRole("dialog"));
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "借", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "方向 2", exact: true }),
  ).toBeFocused();
});

test("sheets animate from the bottom and respect reduced motion in dark mode", async ({
  page,
  app,
}) => {
  await page.emulateMedia({
    reducedMotion: "no-preference",
    colorScheme: "dark",
  });
  await app.open("/transactions/new");
  await page.evaluate(() => {
    (window as any).sheetAnimations = [];
    document.addEventListener("animationstart", (event) => {
      const target = event.target as HTMLElement;
      if (target.matches('[data-slot="dialog-content"]')) {
        const style = getComputedStyle(target);
        (window as any).sheetAnimations.push({
          name: event.animationName,
          duration: parseFloat(style.animationDuration),
          transform: style.transform,
        });
      }
    });
  });
  const category = page.getByRole("combobox", { name: "分类", exact: true });
  await category.click();
  const dialog = page.getByRole("dialog");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).sheetAnimations.some(
          (a: any) =>
            a.name === "sheet-enter" &&
            a.duration >= 0.2 &&
            new DOMMatrix(a.transform).m42 > 0,
        ),
      ),
    )
    .toBe(true);
  await sheetFitsViewport(dialog);
  await expect(page).toHaveScreenshot("category-sheet-dark.png");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).sheetAnimations.some(
          (a: any) => a.name === "sheet-exit" && a.duration >= 0.1,
        ),
      ),
    )
    .toBe(true);
  await expect(category).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await category.click();
  await sheetFitsViewport(dialog);
  expect(
    await dialog.evaluate((el) =>
      parseFloat(getComputedStyle(el).animationDuration),
    ),
  ).toBeLessThan(0.01);
  await page.keyboard.press("Escape");
});

test("settings, accounts and new transaction navigation", async ({
  page,
  app,
}) => {
  await app.open("/settings");
  await expect(
    page.getByRole("heading", { name: "设置", exact: true }),
  ).toBeVisible();
  await fitsViewport(page);
  await expect(page).toHaveScreenshot("settings.png", { fullPage: true });
  await page.getByRole("link", { name: "科目", exact: true }).click();
  await expect(page.getByRole("heading", { name: "科目设置" })).toBeVisible();
  await expect(page.getByRole("link", { name: "记一笔" })).toHaveCount(0);
  await reachable(page.getByRole("button", { name: "新增科目" }));
  await page.locator("summary").filter({ hasText: "资产" }).first().click();
  await page.locator("summary").filter({ hasText: "现金及等价物" }).click();
  await expect(
    page.getByRole("button", { name: /10101.*银行卡/ }),
  ).toBeVisible();
  await fitsViewport(page);
  await expect(page).toHaveScreenshot("accounts.png", { fullPage: true });
  await page.getByRole("link", { name: "返回设置" }).click();
  await page.getByRole("link", { name: "记一笔" }).click();
  await expect(page.getByRole("heading", { name: "新增交易" })).toBeVisible();
  await reachable(page.getByRole("button", { name: "保存交易" }));
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("new transaction saves to list and existing transaction can be deleted", async ({
  page,
  app,
}) => {
  await app.open("/transactions/new");
  await page.getByRole("textbox", { name: "金额（人民币）" }).fill("10");
  await page.getByRole("button", { name: "保存交易" }).click();
  await expect(page.getByRole("heading", { name: "交易流水" })).toBeVisible();
  await page.getByRole("link", { name: /示例消费/ }).click();
  await expect(page.getByRole("heading", { name: "示例消费" })).toBeVisible();
  await page.getByRole("button", { name: "交易操作" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  const request = page.waitForRequest("**/test-api/rpc/delete_transaction");
  await page.getByRole("button", { name: "删除交易", exact: true }).click();
  expect((await request).postDataJSON()).toMatchObject({ p_id: 7 });
  await expect(page.getByRole("heading", { name: "交易流水" })).toBeVisible();
});

test("mobile report panels keep readable charts and explicit date drilldowns", async ({
  page,
  app,
}) => {
  await app.open();
  await page.getByRole("button", { name: "资产负债", exact: true }).click();
  await expect(page.getByRole("region", { name: "科目余额" })).toBeVisible();
  await fitsViewport(page);
  await expect(page).toHaveScreenshot("assets-report.png", { fullPage: true });
  await page.getByRole("button", { name: "现金流量", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "每日现金流入与流出柱状图" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("cash-report.png", { fullPage: true });
  await page.getByRole("button", { name: "损益", exact: true }).click();
  const chart = page.getByRole("img", { name: "本期收入及支出趋势" });
  await expect(chart).toBeVisible();
  expect(
    await chart
      .locator("text")
      .first()
      .evaluate((el) => {
        const m = (el as SVGGraphicsElement).getScreenCTM()!;
        return parseFloat(getComputedStyle(el).fontSize) * Math.hypot(m.a, m.b);
      }),
  ).toBeGreaterThanOrEqual(11);
  await expect(page).toHaveScreenshot("profit-report.png", { fullPage: true });
  const details = page
    .locator("summary")
    .filter({ hasText: "查看每日趋势明细" });
  await details.scrollIntoViewIfNeeded();
  await reachable(details);
  await details.click();
  await page.getByRole("link", { name: "2026-09-08", exact: true }).click();
  await expect(page.getByRole("heading", { name: "交易流水" })).toBeVisible();
  await expect(page.getByRole("group", { name: "已选筛选" })).toContainText(
    "2026-09-08",
  );
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await fitsViewport(page);
});

test("mobile filters preserve context through nested sheets and clear individually", async ({
  page,
  app,
}) => {
  await app.open(
    "/transactions?start=2026-09-08T00:00:00%2B08:00&end=2026-09-09T00:00:00%2B08:00&posted=true",
  );
  await page.getByRole("button", { name: "展开筛选" }).click();
  const filters = page.getByRole("dialog", { name: "筛选流水" });
  await sheetFitsViewport(filters);
  await reachable(filters.getByRole("button", { name: "完成", exact: true }));
  await expect(page).toHaveScreenshot("transaction-filters.png");
  await filters.getByRole("combobox", { name: "支付渠道" }).click();
  await page
    .getByRole("dialog", { name: "选择支付渠道" })
    .getByRole("button", { name: "直接交易" })
    .click();
  await expect(
    filters.getByRole("combobox", { name: "支付渠道" }),
  ).toBeFocused();
  await filters.getByRole("button", { name: "完成", exact: true }).click();
  await expect(filters).toHaveCount(0);
  await expect(page.getByRole("button", { name: "展开筛选" })).toBeFocused();
  const selected = page.getByRole("group", { name: "已选筛选" });
  await expect(selected).toContainText("2026-09-08");
  await expect(selected).toContainText("直接交易");
  await expect(page).toHaveScreenshot("transaction-filtered.png", {
    fullPage: true,
  });
  await page.getByRole("button", { name: "清除筛选：直接交易" }).click();
  await expect(page).not.toHaveURL(/payment_method/);
  await expect(selected).toContainText("2026-09-08");
  await page.getByRole("button", { name: "清除筛选：2026-09-08" }).click();
  await expect(page).not.toHaveURL(/start=/);
  await expect(selected).toContainText("已入账");
  await page.getByRole("button", { name: "清空筛选", exact: true }).click();
  await expect(selected).toHaveCount(0);
});

test("split income keeps account names and amounts usable on mobile", async ({
  page,
  app,
}) => {
  await app.open("/transactions/new");
  await page.getByRole("button", { name: "收入", exact: true }).click();
  await page.getByRole("button", { name: "添加扣款" }).click();
  await page.getByRole("button", { name: "拆分分类" }).click();
  const category = page.getByRole("combobox", { name: "分类 2", exact: true });
  await category.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "搜索分类" }).fill("40101");
  await dialog.getByRole("option", { name: /工资收入/ }).click();
  await expect(category).toContainText("工资收入");
  await expect(category).toBeFocused();
  await fitsViewport(page);
  await reachable(page.getByRole("button", { name: "保存交易" }));
  await expect(page).toHaveScreenshot("income-split.png");
});
