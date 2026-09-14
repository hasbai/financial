import pg from "pg";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new pg.Client({
  connectionString: readFileSync(0, "utf8")
    .trim()
    .replace("sslmode=require", "sslmode=verify-full"),
});
let checks = 0;
const claims = {
  sub: "auth0|6a9e921870e37d7bbfb76c8f",
  iss: "https://hasbai.eu.auth0.com/",
  aud: "https://financial.hasbai.xyz/api",
};
async function identity(c = claims) {
  await db.query("SELECT set_config($1,$2,true)", [
    "request.jwt.claims",
    JSON.stringify(c),
  ]);
}
async function denied(fn, pattern) {
  await db.query("SAVEPOINT negative");
  let caught;
  try {
    await fn();
  } catch (e) {
    caught = e;
  }
  await db.query("ROLLBACK TO SAVEPOINT negative");
  assert.ok(caught, "Expected rejection");
  assert.match(caught.message, pattern);
  checks++;
}
const rpc = async (name, args) =>
  (
    await db.query(
      `SELECT financial.${name}(${args.map((_, i) => "$" + (i + 1)).join(",")}) result`,
      args,
    )
  ).rows[0].result;
// Income and cash retain the original posted-entry semantics; balances have a separate MV suite.
async function compareReports(start, end, asOf) {
  const legacy = await rpc("overview", [start, end, asOf]);
  const params = [start, end, asOf];
  const run = async (sql) => (await db.query(sql, params)).rows;
  const bounds =
    "WITH bounds AS (SELECT $1::timestamptz start, least($2::timestamptz,$3::timestamptz) cutoff) ";
  const before = " CROSS JOIN bounds WHERE occurred_at<cutoff";
  const period = before + " AND occurred_at>=start";
  const totals = {
    ...(
      await run(
        bounds +
          "SELECT sum(income::numeric)::text income,sum(expense::numeric)::text expense,sum(profit::numeric)::text profit FROM financial.income_statement" +
          period,
      )
    )[0],
    ...(
      await run(
        bounds +
          "SELECT sum(inflow::numeric)::text cash_in,sum(outflow::numeric)::text cash_out,sum(net::numeric)::text cash_net FROM financial.cashflow_read" +
          period,
      )
    )[0],
  };
  // PostgreSQL numeric may retain a different zero scale after grouping.
  for (const [key, value] of Object.entries(totals)) {
    assert.equal(
      (
        await db.query("SELECT $1::numeric=$2::numeric ok", [
          value ?? "0",
          legacy[key],
        ])
      ).rows[0].ok,
      true,
      key,
    );
  }
  const categories = await run(
    bounds +
      "SELECT subtype name,type,sum(amount::numeric)::text amount FROM financial.income_statement" +
      period +
      " AND type IN ('收入','支出') GROUP BY subtype,type ORDER BY type,subtype",
  );
  const normalize = (rows) =>
    [...rows].sort((a, b) =>
      JSON.stringify([a.type, a.name]).localeCompare(
        JSON.stringify([b.type, b.name]),
      ),
    );
  assert.deepEqual(normalize(categories), normalize(legacy.categories));
  const cashCategories = await run(
    bounds +
      "SELECT category name,sum(inflow::numeric)::text inflow,sum(outflow::numeric)::text outflow FROM financial.cashflow_read" +
      period +
      " GROUP BY category",
  );
  assert.deepEqual(
    normalize(cashCategories),
    normalize(legacy.cash_categories),
  );
  const trend = await run(
    bounds +
      "SELECT date::text date,sum(income::numeric)::text income,sum(expense::numeric)::text expense FROM financial.income_statement" +
      period +
      " GROUP BY date ORDER BY date",
  );
  assert.deepEqual(trend, legacy.trend);
  const quality = (
    await run(
      bounds +
        "SELECT coalesce(sum(pending_count),0)::int pending,coalesce(sum(pending_count) FILTER(WHERE occurred_at>=start),0)::int period_pending,coalesce(sum(missing_entry_count),0)::int missing_entries,coalesce(sum(missing_account_count),0)::int missing_accounts,coalesce(sum(posted_count),0)::int posted FROM financial.transactions" +
        before,
    )
  )[0];
  for (const [key, value] of Object.entries(quality))
    assert.equal(value, legacy.quality[key], key);
  checks++;
}
const payload = (entries, extra = {}) => ({
  occurred_at: "2090-01-10T12:00:00+08:00",
  status: "success",
  payment_method: "direct",
  payment_id: "",
  merchant: "自动化测试（事务回滚）",
  notes: "",
  entries,
  ...extra,
});
try {
  await db.connect();
  await db.query("BEGIN");
  const expected = {
    account: ["type", "subtype", "name", "notes", "id"],
    transaction: [
      "id",
      "occurred_at",
      "created_at",
      "updated_at",
      "status",
      "payment_method",
      "payment_id",
      "notes",
      "merchant",
    ],
    entry: ["id", "transaction_id", "direction", "account_id", "amount"],
  };
  for (const [table, cols] of Object.entries(expected)) {
    const actual = (
      await db.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2",
        ["financial", table],
      )
    ).rows.map((r) => r.column_name);
    assert.deepEqual(actual.sort(), cols.sort());
    checks++;
  }
  assert.equal(
    (
      await db.query(
        "SELECT count(*) n FROM information_schema.tables WHERE table_schema='financial' AND table_type='BASE TABLE'",
      )
    ).rows[0].n,
    "3",
  );
  checks++;
  await identity();
  await db.query("SET LOCAL ROLE anonymous");
  assert.equal(
    (await db.query("SELECT count(*) n FROM financial.account")).rows[0].n,
    "86",
  );
  checks++;
  const account = (type, name, subtype = "测试") =>
    rpc("save_account", [null, { type, subtype, name }]);
  const bank = await account("资产", "测试银行", "现金及等价物");
  const wallet = await account("资产", "测试钱包", "现金及等价物");
  const income = await account("收入", "测试工资");
  const expense = await account("支出", "测试支出");
  const card = await account("负债", "测试信用卡");
  const invest = await account("资产", "测试投资");
  const entries = (dr, cr, amount) => [
    { direction: "借", account_id: dr.id, amount },
    { direction: "贷", account_id: cr.id, amount },
  ];
  const save = (p, id = null, updatedAt = null) =>
    rpc("save_transaction", [id, updatedAt, p]);
  const salary = await save(payload(entries(bank, income, "10000.00")));
  const spend = await save(payload(entries(expense, bank, "100.00")));
  await save(payload(entries(expense, card, "100.00")));
  await save(payload(entries(card, bank, "100.00")));
  const transfer = await save(payload(entries(wallet, bank, "100.00")));
  await save(payload(entries(bank, card, "1000.00")));
  await save(payload(entries(invest, bank, "500.00")));
  const refunded = await save(
    payload([...spend.entries, ...entries(bank, expense, "30.00")], {
      status: "partial_refund",
    }),
    spend.id,
    spend.updated_at,
  );
  assert.equal(refunded.id, spend.id);
  assert.equal(refunded.entries.length, 4);
  assert.equal(Number(refunded.amount), 70);
  checks++;
  const overview = await rpc("overview", [
    "2090-01-01T00:00:00+08:00",
    "2090-02-01T00:00:00+08:00",
    "2090-02-01T00:00:00+08:00",
  ]);
  assert.equal(Number(overview.income), 10000);
  assert.equal(Number(overview.expense), 170);
  assert.equal(Number(overview.profit), 9830);
  assert.equal(Number(overview.cash_net), 10330);
  assert.equal(Number(overview.cash_in), 11000);
  assert.equal(Number(overview.cash_out), 670);
  checks++;
  assert.equal(
    (
      await db.query(
        "SELECT coalesce(sum(net),0)::numeric::text net FROM financial.cashflow WHERE transaction_id=$1",
        [transfer.id],
      )
    ).rows[0].net,
    "0",
  );
  checks++;
  for (const dates of [
    ["1900-01-01", "1900-02-01", "1900-02-01"],
    ["2020-01-01", "2026-10-01", "2026-09-14T02:00:00Z"],
    ["2090-01-01", "2090-02-01", "2090-02-01"],
    ["2090-01-10T12:00:00+08:00", "2090-01-11", "2090-01-11"],
    ["2090-01-01", "2090-01-10T12:00:00+08:00", "2090-02-01"],
    ["2090-01-10T12:00:00.000001+08:00", "2090-01-11", "2090-01-11"],
    ["2090-01-15", "2090-02-01", "2090-01-01"],
  ])
    await compareReports(...dates);
  const direct = (
    await db.query(
      "SELECT id FROM financial.transactions WHERE account_ids @> ARRAY[$1]::integer[] AND account_types @> ARRAY['资产']::text[] AND has_cash_flow ORDER BY occurred_at DESC,id DESC",
      [bank.id],
    )
  ).rows.map((r) => r.id);
  const oldPage = await rpc("transactions_page", [
    { account_id: String(bank.id), account_type: "资产", cash: "true" },
    null,
    100,
  ]);
  assert.deepEqual(
    direct,
    oldPage.items.map((r) => r.id),
  );
  assert.ok(!direct.includes(transfer.id));
  checks++;
  const views = [
    "transactions",
    "balance_read",
    "balance_history_read",
    "cashflow_daily",
    "income_statement",
    "cashflow_read",
  ];
  for (const view of views) {
    assert.ok(
      (
        await db.query(
          "SELECT reloptions FROM pg_class WHERE oid=$1::regclass",
          ["financial." + view],
        )
      ).rows[0].reloptions.includes("security_invoker=true"),
    );
    await denied(
      () => db.query(`DELETE FROM financial.${view}`),
      /permission denied|cannot delete/,
    );
  }
  const count = (await db.query("SELECT count(*) n FROM financial.transaction"))
    .rows[0].n;
  await denied(
    () => save(payload(entries(bank, income, "1.001"))),
    /VALIDATION/,
  );
  await denied(
    () =>
      save(
        payload([
          { direction: "借", account_id: bank.id, amount: "2.00" },
          { direction: "贷", account_id: income.id, amount: "1.00" },
        ]),
      ),
    /借贷平衡/,
  );
  await denied(
    () => save(payload(entries(bank, income, "1.00")), salary.id, "2000-01-01"),
    /CONFLICT/,
  );
  await denied(
    () => save(payload(entries(bank, { id: -1 }, "1.00"))),
    /科目不存在/,
  );
  assert.equal(
    (await db.query("SELECT count(*) n FROM financial.transaction")).rows[0].n,
    count,
  );
  checks++;
  const latest = await save(
    payload(salary.entries, { notes: "修改备注" }),
    salary.id,
    salary.updated_at,
  );
  assert.deepEqual(
    latest.entries.map((e) => e.id),
    salary.entries.map((e) => e.id),
  );
  checks++;
  const unfinished = await save(
    payload([
      { direction: "借", account_id: null, amount: "10.00" },
      { direction: "贷", account_id: bank.id, amount: "10.00" },
    ]),
  );
  assert.equal(unfinished.complete, false);
  checks++;
  await save(payload(entries(bank, income, "77.00"), { status: "pending" }));
  await save(payload([], { status: "cancel" }));
  const literal = await save(payload([], { merchant: "a.*(商户),%_" }));
  assert.equal(
    (
      await db.query(
        "SELECT id FROM financial.transactions WHERE search_text ~* $1 AND id=$2",
        [String.raw`a\.\*\(商户\),%_`, literal.id],
      )
    ).rows[0].id,
    literal.id,
  );
  checks++;
  await compareReports("2090-01-01", "2090-02-01", "2090-02-01");
  await denied(
    () =>
      db.query("UPDATE financial.transaction SET notes=$1 WHERE id=$2", [
        "unauthorized",
        salary.id,
      ]),
    /permission denied/,
  );
  await identity({ ...claims, sub: "auth0|someone-else" });
  assert.equal(
    (await db.query("SELECT count(*) n FROM financial.transaction")).rows[0].n,
    "0",
  );
  checks++;
  await denied(() => save(payload(entries(bank, income, "1.00"))), /FORBIDDEN/);
  for (const c of [
    { ...claims, aud: "other-api" },
    { ...claims, iss: "https://wrong.example/" },
    {},
  ]) {
    await identity(c);
    assert.equal(
      (await db.query("SELECT financial.is_owner() allowed")).rows[0].allowed,
      false,
    );
    for (const view of views) {
      assert.equal(
        (await db.query(`SELECT count(*) n FROM financial.${view}`)).rows[0].n,
        "0",
      );
    }
    checks++;
  }
  console.log(
    `PASS ${checks} database checks. Original columns only, 3 tables, same-transaction refund, cash netting, precision, atomic saves, owner access, read-view parity and isolation. All test data rolled back.`,
  );
} catch (e) {
  console.error(e.code ?? "", e.message, e.where ?? "");
  process.exitCode = 1;
} finally {
  await db.query("ROLLBACK").catch(() => {});
  await db.end();
}
