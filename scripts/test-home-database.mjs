import pg from "pg";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new pg.Client({
  connectionString: readFileSync(0, "utf8")
    .trim()
    .replace("sslmode=require", "sslmode=verify-full"),
});
const claims = {
  sub: "auth0|6a9e921870e37d7bbfb76c8f",
  iss: "https://hasbai.eu.auth0.com/",
  aud: "https://financial.hasbai.xyz/api",
};
let checks = 0;
const identity = async (c = claims) =>
  db.query("SELECT set_config('request.jwt.claims',$1,true)", [
    JSON.stringify(c),
  ]);
const fingerprint = async () =>
  (
    await db.query(
      "SELECT 'account' name,count(*)::int n,md5(string_agg(row_to_json(t)::text,'' ORDER BY id)) hash FROM financial.account t UNION ALL SELECT 'transaction',count(*)::int,md5(string_agg(row_to_json(t)::text,'' ORDER BY id)) FROM financial.transaction t UNION ALL SELECT 'entry',count(*)::int,md5(string_agg(row_to_json(t)::text,'' ORDER BY id)) FROM financial.entry t",
    )
  ).rows;
const eq = async (a, b) =>
  assert.equal(
    (await db.query("SELECT $1::numeric=$2::numeric ok", [a, b])).rows[0].ok,
    true,
  );
async function compare() {
  const h = (await db.query("SELECT row_to_json(h) h FROM financial.home h"))
    .rows[0].h;
  const old = (
    await db.query("SELECT financial.overview($1,$2,$2) r", [h.start, h.as_of])
  ).rows[0].r;
  for (const k of [
    "assets",
    "liabilities",
    "net_assets",
    "income",
    "expense",
    "profit",
  ])
    await eq(h[k], old[k]);
  assert.equal(h.pending, old.quality.pending);
  for (let i = 0; i < 6; i++) {
    const at = new Date(
      Date.parse(h.start) +
        ((Date.parse(h.as_of) - Date.parse(h.start)) * i) / 5,
    ).toISOString();
    const r = (
      await db.query(
        "SELECT coalesce(sum(net_assets::numeric),0)::text n FROM financial.balance_sheet WHERE occurred_at<$1",
        [at],
      )
    ).rows[0];
    await eq(h.balance_trend[i], r.n);
  }
  const cash = (
    await db.query("SELECT financial.overview($1,$2,$2) r", [
      h.as_of,
      h.future_end,
    ])
  ).rows[0].r;
  for (const k of ["cash_in", "cash_out", "cash_net"])
    await eq(h.cash[k], cash[k]);
  for (const b of h.cash_bars) {
    const r = (
      await db.query("SELECT financial.overview($1,$2,$2) r", [b.start, b.end])
    ).rows[0].r;
    await eq(b.inflow, r.cash_in);
    await eq(b.outflow, r.cash_out);
  }
  assert.deepEqual(
    h.recent.map((t) => t.id),
    (
      await db.query(
        "SELECT id FROM financial.transactions ORDER BY occurred_at DESC,id DESC LIMIT 3",
      )
    ).rows.map((t) => t.id),
  );
  assert.equal(
    h.cash_configured,
    (
      await db.query(
        "SELECT EXISTS(SELECT 1 FROM financial.account WHERE type='资产' AND subtype='现金及等价物') ok",
      )
    ).rows[0].ok,
  );
  assert.ok(
    h.recent.every((t) => typeof t.category === "string" && !("entries" in t)),
  );
  checks++;
  return h;
}
try {
  await db.connect();
  const before = await fingerprint();
  await db.query("BEGIN");
  await identity();
  await db.query("SET LOCAL ROLE anonymous");
  const base = await compare();
  assert.ok(
    (
      await db.query(
        "SELECT reloptions FROM pg_class WHERE oid='financial.home'::regclass",
      )
    ).rows[0].reloptions.includes("security_invoker=true"),
  );
  const a = (
    await db.query(
      "SELECT id FROM financial.account WHERE type='资产' AND subtype='现金及等价物' LIMIT 1",
    )
  ).rows[0].id;
  const income = (
    await db.query("SELECT id FROM financial.account WHERE type='收入' LIMIT 1")
  ).rows[0].id;
  const expense = (
    await db.query("SELECT id FROM financial.account WHERE type='支出' LIMIT 1")
  ).rows[0].id;
  for (const [at, dr, cr, status] of [
    [base.as_of, a, income, "success"],
    [base.future_end, a, income, "success"],
    [
      new Date(Date.parse(base.as_of) + 6 * 86400000).toISOString(),
      expense,
      a,
      "success",
    ],
    [base.as_of, a, income, "pending"],
  ]) {
    await db.query("SELECT financial.save_transaction(NULL,NULL,$1)", [
      {
        occurred_at: at,
        status,
        payment_method: "direct",
        merchant: "首页边界验证（回滚）",
        entries: [
          { account_id: dr, direction: "借", amount: "12.34" },
          { account_id: cr, direction: "贷", amount: "12.34" },
        ],
      },
    ]);
  }
  const nonempty = await compare();
  assert.equal(nonempty.cash_bars.length, 5);
  assert.equal(
    Date.parse(nonempty.future_end) - Date.parse(nonempty.as_of),
    30 * 86400000,
  );
  checks++;
  for (const c of [
    { ...claims, sub: "wrong" },
    { ...claims, aud: "wrong" },
    { ...claims, iss: "wrong" },
    {},
  ]) {
    await identity(c);
    assert.equal(
      (await db.query("SELECT * FROM financial.home")).rows.length,
      0,
    );
    checks++;
  }
  await db.query("ROLLBACK");
  assert.deepEqual(await fingerprint(), before);
  checks++;
  console.log(
    `PASS ${checks} home database scenarios: legacy figures, six chart points, cash boundaries/buckets, recent categories, invoker identity isolation, unchanged base rows.`,
  );
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
