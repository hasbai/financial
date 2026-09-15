import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
export async function buildPwa(directory) {
  async function files(path = "") {
    const result = [];
    for (const item of await readdir(join(directory, path), {
      withFileTypes: true,
    })) {
      const name = path ? `${path}/${item.name}` : item.name;
      if (item.isDirectory()) result.push(...(await files(name)));
      else if (
        name === "index.html" ||
        name === "manifest.webmanifest" ||
        name.startsWith("assets/") ||
        name.startsWith("icons/")
      )
        result.push(name);
    }
    return result.sort();
  }
  const paths = await files();
  const hash = createHash("sha256").update("navigation-response-v2");
  for (const path of paths) {
    hash.update(path);
    hash.update(await readFile(join(directory, path)));
  }
  const cache = `financial-static-${hash.digest("hex").slice(0, 16)}`;
  const source = `const CACHE = ${JSON.stringify(cache)};
const FILES = ${JSON.stringify(paths.map((p) => (p === "index.html" ? "/" : "/" + p)))};
// Redirected cached responses cannot satisfy navigation requests with redirect: manual.
async function navigationResponse(response) {
  if (!response || !response.redirected) return response;
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: response.headers });
}
async function repairPreviousNavigationCaches() {
  for (const key of await caches.keys()) {
    if (!key.startsWith('financial-static-') || key === CACHE) continue;
    const cache = await caches.open(key);
    const response = await cache.match('/index.html');
    if (response && response.redirected && response.ok) {
      // Repair the still-active worker's response in place. Do not replace its app version.
      await cache.put('/index.html', await navigationResponse(response));
    }
  }
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await repairPreviousNavigationCaches();
    await (await caches.open(CACHE)).addAll(FILES);
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('financial-static-') && key !== CACHE).map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('authorization')) return;
  if (request.mode === 'navigate') {
    event.respondWith(caches.open(CACHE).then(async cache => navigationResponse((await cache.match('/')) || await fetch(request))));
  } else if (!url.search && FILES.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(url.pathname)) || fetch(request)));
  }
});
`;
  await writeFile(join(directory, "sw.js"), source);
}
