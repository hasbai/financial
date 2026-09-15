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
  const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
  runInNewContext(source, {
    URL,
    Response,
    self: {
      location: { origin: "https://financial.hasbai.xyz" },
      skipWaiting: vi.fn(),
      addEventListener: (name: string, fn: any) => (handlers[name] = fn),
    },
    caches: {
      open: vi.fn().mockResolvedValue(cache),
      keys: vi.fn().mockResolvedValue([]),
    },
    fetch: fetcher,
  });
  let pending: Promise<unknown> = Promise.resolve();
  handlers.install({ waitUntil: (p: Promise<unknown>) => (pending = p) });
  await pending;
  expect(cache.addAll).toHaveBeenCalledWith([
    "/assets/app.js",
    "/",
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
  expect(fetcher).toHaveBeenCalledWith("/", { cache: "no-store" });
  await writeFile(join(dir, "assets/app.js"), "updated");
  await buildPwa(dir);
  expect((await readFile(join(dir, "sw.js"), "utf8")).split("\n")[0]).not.toBe(
    source.split("\n")[0],
  );
});

it("handles a real HTTP redirect and repairs the still-active worker cache before activation", async () => {
  const { createServer } = await import("node:http");
  const server = createServer((request, response) => {
    if (request.url === "/index.html") {
      response.writeHead(307, { Location: "/" });
      response.end();
    } else {
      response.writeHead(200, {
        "Content-Type": "text/html",
        "X-App-Version": "old",
      });
      response.end("<html>previous application</html>");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    const origin = `http://127.0.0.1:${address.port}`;
    const redirected = await fetch(origin + "/index.html");
    expect(redirected.redirected).toBe(true);
    const originalBody = await redirected.clone().text();
    const dir = await mkdtemp(join(tmpdir(), "financial-pwa-redirect-"));
    directories.push(dir);
    await writeFile(join(dir, "index.html"), "<html>new application</html>");
    await buildPwa(dir);
    const source = await readFile(join(dir, "sw.js"), "utf8");
    const handlers: Record<string, (event: any) => void> = {};
    const stores = new Map<string, Map<string, Response>>([
      ["financial-static-old", new Map([["/index.html", redirected.clone()]])],
      ["unrelated", new Map([["/index.html", redirected.clone()]])],
    ]);
    const cacheApi = {
      keys: async () => [...stores.keys()],
      open: async (key: string) => {
        if (!stores.has(key)) stores.set(key, new Map());
        const store = stores.get(key)!;
        return {
          match: async (path: string) => store.get(path)?.clone(),
          put: async (path: string, value: Response) => {
            store.set(path, value.clone());
          },
          addAll: async (paths: string[]) => {
            expect(paths).toEqual(["/"]);
            for (const path of paths)
              store.set(path, await fetch(origin + path));
          },
        };
      },
    };
    runInNewContext(source, {
      URL,
      Response,
      self: {
        location: { origin },
        skipWaiting: vi.fn(),
        addEventListener: (name: string, fn: any) => (handlers[name] = fn),
      },
      caches: cacheApi,
      fetch: () => Promise.reject(new Error("offline")),
    });
    let pending: Promise<unknown> = Promise.resolve();
    handlers.install({ waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
    // The old worker can immediately reuse the same key and body without skipWaiting or reload.
    const repaired = stores.get("financial-static-old")!.get("/index.html")!;
    expect(repaired.redirected).toBe(false);
    expect(await repaired.clone().text()).toBe(originalBody);
    expect(repaired.headers.get("x-app-version")).toBe("old");
    expect(stores.get("unrelated")!.get("/index.html")!.redirected).toBe(true);
    const current = [...stores.keys()].find(
      (key) =>
        key.startsWith("financial-static-") && key !== "financial-static-old",
    )!;
    // Defend against a redirected navigation cache even if hosting redirects the canonical URL later.
    stores.get(current)!.set("/", redirected.clone());
    for (const path of [
      "/",
      "/transactions/new",
      "/auth/callback?code=example&state=example",
    ]) {
      let result: Promise<Response> | undefined;
      handlers.fetch({
        request: {
          url: origin + path,
          method: "GET",
          mode: "navigate",
          redirect: "manual",
          headers: new Headers(),
        },
        respondWith: (p: Promise<Response>) => (result = p),
      });
      const response = await result!;
      expect(response.redirected).toBe(false);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(originalBody);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it("activates a complete update with old windows open, serves fresh navigations and preserves their lazy chunks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "financial-pwa-update-"));
  directories.push(dir);
  await mkdir(join(dir, "assets"));
  await writeFile(join(dir, "index.html"), "<html>installed-new</html>");
  await writeFile(join(dir, "assets/new.js"), "new code");
  await buildPwa(dir);
  const source = await readFile(join(dir, "sw.js"), "utf8");
  const current = JSON.parse(
    source.split("\n")[0].slice("const CACHE = ".length, -1),
  );
  const stores = new Map<string, Map<string, Response>>([
    [
      "financial-static-old",
      new Map([
        ["/", new Response("<html>old page</html>")],
        ["/assets/old.js", new Response("old lazy chunk")],
      ]),
    ],
    ["another-app", new Map([["/assets/other.js", new Response("unrelated")]])],
  ]);
  let precached = false;
  let failInstall = false;
  const cacheApi = {
    keys: async () => [...stores.keys()],
    delete: vi.fn(async (key: string) => stores.delete(key)),
    open: async (key: string) => {
      if (!stores.has(key)) stores.set(key, new Map());
      const store = stores.get(key)!;
      return {
        match: async (path: string) => store.get(path)?.clone(),
        addAll: async () => {
          if (failInstall) throw new Error("incomplete download");
          store.set("/", new Response("<html>installed-new</html>"));
          store.set("/assets/new.js", new Response("new code"));
          precached = true;
        },
      };
    },
  };
  const handlers: Record<string, (event: any) => void> = {};
  const skipWaiting = vi.fn(() => {
    expect(precached).toBe(true);
  });
  const navigateWindow = vi.fn();
  const clients = {
    matchAll: vi
      .fn()
      .mockResolvedValue([{ id: "old-editor", navigate: navigateWindow }]),
    claim: vi.fn(),
  };
  const fetcher = vi.fn().mockResolvedValue(
    new Response("<html>latest-online</html>", {
      headers: { "content-type": "text/html" },
    }),
  );
  runInNewContext(source, {
    URL,
    Response,
    caches: cacheApi,
    fetch: fetcher,
    self: {
      location: { origin: "https://financial.hasbai.xyz" },
      skipWaiting,
      clients,
      addEventListener: (name: string, fn: any) => {
        handlers[name] = fn;
      },
    },
  });
  async function lifecycle(name: string) {
    let pending!: Promise<unknown>;
    handlers[name]({
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    await pending;
  }
  async function request(path: string, mode = "navigate") {
    let result!: Promise<Response>;
    handlers.fetch({
      request: {
        url: "https://financial.hasbai.xyz" + path,
        method: "GET",
        mode,
        headers: new Headers(),
      },
      respondWith: (promise: Promise<Response>) => {
        result = promise;
      },
    });
    return result;
  }
  // Reproduce the previous active worker: a newer server does not affect its cache-first refresh.
  const oldRefresh = await (
    await cacheApi.open("financial-static-old")
  ).match("/");
  expect(await oldRefresh!.text()).toContain("old page");
  await lifecycle("install");
  expect(skipWaiting).toHaveBeenCalledTimes(1);
  await lifecycle("activate");
  expect(clients.claim).toHaveBeenCalledTimes(1);
  expect(cacheApi.delete).not.toHaveBeenCalled();
  expect(navigateWindow).not.toHaveBeenCalled();
  const page = await request("/auth/callback?code=private&state=private");
  expect(await page.text()).toContain("latest-online");
  expect(fetcher).toHaveBeenCalledWith("/", { cache: "no-store" });
  // Online HTML is never persisted into a cache whose assets belong to a different release.
  expect(await stores.get(current)!.get("/")!.clone().text()).toContain(
    "installed-new",
  );
  fetcher.mockRejectedValue(new Error("offline"));
  expect(await (await request("/transactions/new")).text()).toContain(
    "installed-new",
  );
  expect(await (await request("/assets/old.js", "cors")).text()).toBe(
    "old lazy chunk",
  );
  await expect(request("/assets/other.js", "cors")).rejects.toThrow("offline");
  fetcher.mockResolvedValue(new Response("server error", { status: 503 }));
  expect(await (await request("/")).text()).toContain("installed-new");
  clients.matchAll.mockResolvedValue([]);
  await lifecycle("activate");
  expect(stores.has("financial-static-old")).toBe(false);
  expect(stores.has("another-app")).toBe(true);
  expect(stores.has(current)).toBe(true);
  failInstall = true;
  skipWaiting.mockClear();
  await expect(lifecycle("install")).rejects.toThrow("incomplete download");
  expect(skipWaiting).not.toHaveBeenCalled();
});
