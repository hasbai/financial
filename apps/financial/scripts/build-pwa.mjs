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
  const hash = createHash("sha256").update("navigation-update-v3");
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
    // Claim future requests only after this release is fully available offline.
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Existing documents keep running and may still import old hashed chunks.
    // Delete old releases only when there are no open windows to depend on them.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (!windows.length) {
      await Promise.all((await caches.keys()).filter(key => key.startsWith('financial-static-') && key !== CACHE).map(key => caches.delete(key)));
    }
    await self.clients.claim();
  })());
});
async function navigate() {
  try {
    // Fetch the canonical public shell, never cache auth callbacks or URL parameters.
    const response = await fetch('/', { cache: 'no-store' });
    if (response.ok && response.headers.get('content-type')?.includes('text/html')) {
      return navigationResponse(response);
    }
  } catch { /* Offline: use the last fully installed release. */ }
  return navigationResponse(await (await caches.open(CACHE)).match('/'));
}
async function staticResponse(path, request) {
  const current = await (await caches.open(CACHE)).match(path);
  if (current) return current;
  if (path.startsWith('/assets/')) {
    for (const key of await caches.keys()) {
      if (!key.startsWith('financial-static-') || key === CACHE) continue;
      const previous = await (await caches.open(key)).match(path);
      if (previous) return previous;
    }
  }
  return fetch(request);
}
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('authorization')) return;
  if (request.mode === 'navigate') {
    event.respondWith(navigate());
  } else if (!url.search && (FILES.includes(url.pathname) || url.pathname.startsWith('/assets/'))) {
    event.respondWith(staticResponse(url.pathname, request));
  }
});
`;
  await writeFile(join(directory, "sw.js"), source);
}
