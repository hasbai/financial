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
      const homeRequests = requests.length;
      assert.equal(new Set(requests).size, homeRequests);
      assert.ok(
        requests.every((r) => !/_read$|\/home$/.test(new URL(r).pathname)),
      );
      assert.ok(Array.isArray(home.balance_trend));
      assert.deepEqual(home.recent, []);
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
      const history = await api.report(
        "balanceHistory",
        home.start,
        home.as_of,
        home.as_of,
      );
      assert.deepEqual(
        home.balance_trend,
        history.map((r) => r.net_assets),
      );
      const daily = await api.report(
        "cashDaily",
        home.start,
        home.as_of,
        home.as_of,
      );
      assert.equal(home.month_cash_bars.length, daily.length);
      const hidden = await api.home(false);
      assert.ok(!("balance_trend" in hidden));
      assert.ok(!("cash_bars" in hidden));
      console.log(
        `PASS real JWT home: ${homeRequests} source GETs, ${elapsed}ms, ${Buffer.byteLength(JSON.stringify(home))} bytes; figures match full report; hidden projection excludes charts.`,
      );
    } finally {
      globalThis.fetch = original;
    }
  });
} finally {
  await vite.close();
}
