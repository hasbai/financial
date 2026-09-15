import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { buildPwa } from "../../scripts/build-pwa.mjs";
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
it("precache is versioned, contains only static app resources, and never intercepts financial API/auth requests", async () => {
  const dir = await mkdtemp(join(tmpdir(), "financial-pwa-test-"));
  directories.push(dir);
  await mkdir(join(dir, "assets"));
  await writeFile(join(dir, "index.html"), "<html>app</html>");
  await writeFile(join(dir, "assets/app.js"), "app");
  await writeFile(join(dir, "manifest.webmanifest"), "{}");
  await buildPwa(dir);
  const source = await readFile(join(dir, "sw.js"), "utf8");
  const handlers: Record<string, (event: any) => void> = {};
  const cache = {
    addAll: vi.fn().mockResolvedValue(undefined),
    match: vi.fn().mockResolvedValue("cached-app"),
  };
  const fetcher = vi.fn();
  runInNewContext(source, {
    URL,
    self: {
      location: { origin: "https://financial.hasbai.xyz" },
      addEventListener: (name: string, fn: any) => (handlers[name] = fn),
    },
    caches: { open: vi.fn().mockResolvedValue(cache) },
    fetch: fetcher,
  });
  let pending: Promise<unknown> = Promise.resolve();
  handlers.install({ waitUntil: (p: Promise<unknown>) => (pending = p) });
  await pending;
  expect(cache.addAll).toHaveBeenCalledWith([
    "/assets/app.js",
    "/index.html",
    "/manifest.webmanifest",
  ]);
  const dispatch = (
    url: string,
    method = "GET",
    auth = false,
    mode = "cors",
  ) => {
    const respondWith = vi.fn();
    handlers.fetch({
      request: { url, method, mode, headers: { has: () => auth } },
      respondWith,
    });
    return respondWith;
  };
  expect(
    dispatch("https://api.example/rest/v1/account").mock.calls,
  ).toHaveLength(0);
  expect(
    dispatch("https://hasbai.eu.auth0.com/oauth/token", "POST").mock.calls,
  ).toHaveLength(0);
  expect(
    dispatch("https://financial.hasbai.xyz/index.html", "GET", true).mock.calls,
  ).toHaveLength(0);
  expect(
    dispatch("https://financial.hasbai.xyz/api/transaction", "POST").mock.calls,
  ).toHaveLength(0);
  expect(
    dispatch("https://financial.hasbai.xyz/assets/app.js?token=private").mock
      .calls,
  ).toHaveLength(0);
  const response = dispatch(
    "https://financial.hasbai.xyz/transactions/7",
    "GET",
    false,
    "navigate",
  );
  expect(await response.mock.calls[0][0]).toBe("cached-app");
  expect(fetcher).not.toHaveBeenCalled();
  expect(source).not.toContain("skipWaiting");
  await writeFile(join(dir, "assets/app.js"), "updated");
  await buildPwa(dir);
  expect((await readFile(join(dir, "sw.js"), "utf8")).split("\n")[0]).not.toBe(
    source.split("\n")[0],
  );
});
