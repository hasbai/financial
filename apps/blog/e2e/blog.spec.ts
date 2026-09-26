import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.get('http://127.0.0.1:4180/reset');
});

test('desktop background paints and respects reduced motion', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.context().route(/\/petals-fallback\.svg$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body, '::after').backgroundImage)).toContain('petals-fallback.svg');
  await page.context().unroute(/\/petals-fallback\.svg$/);
  const background = page.locator('.background-texture');
  await expect(background).toHaveClass(/visible/);
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.background-texture');
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return 0;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 0) return 1;
    return 0;
  })).toBe(1);
  await expect.poll(() => page.evaluate(() => Number(getComputedStyle(document.body, '::after').opacity))).toBe(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(background).not.toHaveClass(/visible/);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body, '::after').content)).toBe('none');
});

test('SSR, direct Data API navigation, skeleton, canonical URLs and reading states', async ({ page, request }) => {
  const response = await request.get('/articles/hello-world');
  expect(await response.text()).toContain('从一页空白开始');
  const dataRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('__data.json')) dataRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /北极手记/ })).toBeVisible();
  await expect(page).toHaveScreenshot('home.png', { fullPage: true });

  await page.route(/\/rest\/v1\/article\?/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 450));
    await route.continue();
  });
  const navigate = page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '文章' }).click();
  await expect(page.getByLabel('正在打开页面')).toBeVisible();
  await navigate;
  await expect(page.getByRole('heading', { name: '文章', exact: true })).toBeVisible();
  expect(dataRequests).toEqual([]);
  await page.unroute(/\/rest\/v1\/article\?/);
  await expect(page).toHaveScreenshot('articles.png', { fullPage: true });

  await page.getByRole('link', { name: /Hello World，开始记录/ }).click();
  await expect(page).toHaveURL(/\/articles\/hello-world$/);
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://hasbai.xyz/articles/hello-world');
  await expect(page).toHaveScreenshot('article.png', { fullPage: true });
  await page.getByRole('button', { name: '切换深色' }).click();
  await expect(page).toHaveScreenshot('article-dark.png', { fullPage: true });
  await page.getByRole('button', { name: '切换浅色' }).click();

  const common = await request.get('/contents/20000000-0000-4000-8000-000000000001');
  expect(common.url()).toContain('/articles/hello-world');
  const legacy = await request.get('/notes/hello-world', { maxRedirects: 0 });
  expect(legacy.status()).toBe(308);
  expect(legacy.headers().location).toBe('/articles/hello-world');

  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '手记' }).click();
  await expect(page.getByRole('heading', { name: '手记', exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot('notes.png', { fullPage: true });
  await page.getByRole('link', { name: /今天想把一个简单的念头/ }).click();
  await expect(page).toHaveURL(/\/notes\/1$/);
  await expect(page).toHaveScreenshot('note.png', { fullPage: true });
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '时间线' }).click();
  await expect(page).toHaveScreenshot('timeline.png', { fullPage: true });
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '关于' }).click();
  await expect(page).toHaveScreenshot('about.png', { fullPage: true });
  await page.goto('/tags/writing');
  await expect(page).toHaveScreenshot('tag.png', { fullPage: true });

  await request.get('http://127.0.0.1:4180/empty');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '还没有文字' })).toBeVisible();
  await expect(page).toHaveScreenshot('empty.png', { fullPage: true });
  await request.get('http://127.0.0.1:4180/fail');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '内容暂时无法加载' })).toBeVisible();
  await expect(page).toHaveScreenshot('error.png', { fullPage: true });
});

test('editor writes articles and titleless notes through Data API', async ({ page }) => {
  await page.goto('/auth/callback?code=fixture&state=fixture');
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByRole('heading', { name: '编辑室', exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot('studio.png', { fullPage: true });

  await page.getByRole('link', { name: '新文章' }).click();
  await page.getByLabel('标题', { exact: true }).fill('测试文章');
  await page.getByLabel('文章网址').fill('test-article');
  await page.getByRole('textbox', { name: '文章正文' }).fill('一次新的写作。');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await page.getByLabel('Markdown 源码').fill('## 标题\n\n保存并发布。');
  await page.getByRole('button', { name: 'Markdown', exact: true }).click();
  await expect(page).toHaveScreenshot('editor.png', { fullPage: true });
  const articleSave = page.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/rpc/save_article'));
  await page.getByRole('button', { name: '发布文章', exact: true }).click();
  expect((await articleSave).postDataJSON()).toMatchObject({ p_id: expect.any(String), p_status: 'published', p_markdown: expect.stringContaining('## 标题') });
  await expect(page.getByRole('link', { name: '查看' })).toBeVisible();

  await page.goto('/studio/notes/new');
  await page.getByRole('textbox', { name: '文章正文' }).fill('今天的一则手记。');
  await expect(page).toHaveScreenshot('note-editor.png', { fullPage: true });
  const noteSave = page.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/note'));
  await page.getByRole('button', { name: '发布手记', exact: true }).click();
  const noteBody = (await noteSave).postDataJSON();
  expect(noteBody).toMatchObject({ id: expect.any(String), status: 'published' });
  expect(noteBody).not.toHaveProperty('title');
  expect(noteBody).not.toHaveProperty('tag_ids');
  await expect(page.getByRole('link', { name: '查看' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
