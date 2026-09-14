import assert from "node:assert/strict";
import { createServer } from "vite";
import { withUserToken } from "./auth0-token.mjs";
// Explicitly set VITE_DATA_API_URL to the migrated branch before running.
assert.ok(
  process.env.VITE_DATA_API_URL,
  "VITE_DATA_API_URL must select the verification branch",
);
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { createRepository } = await vite.ssrLoadModule("/src/lib/api.ts");
  await withUserToken(async (token) => {
    const original = globalThis.fetch;
    const requests = [];
    globalThis.fetch = async (input, init) => {
      requests.push(String(input));
      return original(input, init);
    };
    try {
      const api = createRepository(async () => token);
      const started = performance.now();
      const home = await api.home();
      const elapsed = Math.round(performance.now() - started);
      assert.equal(requests.length, 1);
      assert.ok(new URL(requests[0]).pathname.endsWith("/home"));
      assert.equal(home.balance_trend.length, 6);
      assert.ok(home.recent.length <= 3);
      const full = await api.overview(home.start, home.as_of, home.as_of);
      for (const k of [
        "assets",
        "liabilities",
        "net_assets",
        "income",
        "expense",
        "profit",
      ])
        assert.equal(home[k], full[k]);
      assert.equal(home.pending, full.quality.pending);
      const hidden = await api.home(false);
      assert.ok(!("balance_trend" in hidden));
      assert.ok(!("cash_bars" in hidden));
      console.log(
        `PASS real JWT home: 1 GET, ${elapsed}ms, ${Buffer.byteLength(JSON.stringify(home))} bytes; figures match full report; hidden projection excludes charts.`,
      );
    } finally {
      globalThis.fetch = original;
    }
  });
} finally {
  await vite.close();
}
