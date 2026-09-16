import pg from "pg";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new pg.Client({
  connectionString: readFileSync(0, "utf8")
    .trim()
    .replace("sslmode=require", "sslmode=verify-full"),
});
let checks = 0;
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
async function reportTotals(start, end, asOf) {
  return (
    await db.query(
      `WITH bounds AS (SELECT $1::timestamptz start, least($2::timestamptz,$3::timestamptz) cutoff),
    income AS (SELECT coalesce(sum(income::numeric),0) income,coalesce(sum(expense::numeric),0) expense,coalesce(sum(profit::numeric),0) profit
      FROM financial.income_statement,bounds WHERE occurred_at>=start AND occurred_at<cutoff),
    cash AS (SELECT coalesce(sum(greatest(net,0)),0) cash_in,coalesce(sum(greatest(-net,0)),0) cash_out,coalesce(sum(net),0) cash_net
      FROM financial.cashflow,bounds WHERE occurred_at>=start AND occurred_at<cutoff)
    SELECT * FROM income CROSS JOIN cash`,
      [start, end, asOf],
    )
  ).rows[0];
}
async function compareReports(start, end, asOf) {
  const totals = await reportTotals(start, end, asOf);
  const expected = (
    await db.query(
      `SELECT
    -coalesce(sum(signed_amount) FILTER(WHERE type='收入'),0) income,
    coalesce(sum(signed_amount) FILTER(WHERE type='支出'),0) expense,
    -coalesce(sum(signed_amount) FILTER(WHERE type IN ('收入','支出')),0) profit,
    coalesce(sum(signed_amount) FILTER(WHERE subtype='现金及等价物'),0) cash_net
    FROM financial.statement_entries WHERE occurred_at >= $1::timestamptz AND occurred_at < least($2::timestamptz,$3::timestamptz)`,
      [start, end, asOf],
    )
  ).rows[0];
  for (const [key, value] of Object.entries(expected))
    assert.ok(
      (
        await db.query("SELECT $1::numeric=$2::numeric ok", [
          value,
          totals[key],
        ])
      ).rows[0].ok,
      key,
    );
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
  await db.query("SET LOCAL ROLE superadmin");
  // Reading succeeds under the application role regardless of ledger size.
  await db.query("SELECT id FROM financial.account LIMIT 1");
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
  const overview = await reportTotals(
    "2090-01-01T00:00:00+08:00",
    "2090-02-01T00:00:00+08:00",
    "2090-02-01T00:00:00+08:00",
  );
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
  assert.ok(!direct.includes(transfer.id));
  checks++;
  const views = [
    "transactions",
    "income_statement",
    "cashflow",
    "statement_entries",
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
  await denied(
    () => db.query("SELECT financial.refresh_balances()"),
    /permission denied/,
  );
  for (const role of ["anonymous", "authenticated"]) {
    await db.query("RESET ROLE");
    await db.query(`SET LOCAL ROLE ${role}`);
    for (const view of [...views, "balance", "balance_history", "account"])
      await denied(
        () => db.query(`SELECT * FROM financial.${view} LIMIT 1`),
        /permission denied/,
      );
    await denied(
      () => save(payload(entries(bank, income, "1.00"))),
      /permission denied/,
    );
  }
  console.log(
    `PASS ${checks} database checks. Original columns only, 3 tables, same-transaction refund, cash netting, precision, atomic saves, role grants, report parity and isolation. All test data rolled back.`,
  );
} catch (e) {
  console.error(e.code ?? "", e.message, e.where ?? "");
  process.exitCode = 1;
} finally {
  await db.query("ROLLBACK").catch(() => {});
  await db.end();
}
