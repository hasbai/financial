import pg from "pg";
import assert from "node:assert/strict";

const db = new pg.Client({
  connectionString: await new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () =>
      resolve(data.trim().replace("sslmode=require", "sslmode=verify-full")),
    );
    process.stdin.on("error", reject);
  }),
});

let checks = 0;
let stage = "startup";
const evidence = [];
const note = (name, value) => {
  evidence.push(
    `${name}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
  );
};
const q = async (sql, params = []) => {
  try {
    return await db.query(sql, params);
  } catch (e) {
    e.stage = e.stage ?? stage;
    throw e;
  }
};
const rpc = async (name, args) => {
  try {
    return (
      await q(
        `SELECT financial.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) result`,
        args,
      )
    ).rows[0].result;
  } catch (e) {
    e.stage = stage;
    throw e;
  }
};
const balance = async (id) =>
  (
    await q(
      "SELECT balance::numeric::text balance FROM financial.balance WHERE id=$1",
      [id],
    )
  ).rows[0]?.balance ?? null;
const history = async (id, start = "2026-09-01", end = "2026-09-15") =>
  (
    await q(
      "SELECT date::text date,balance::numeric::text balance FROM financial.balance_history WHERE id=$1 AND date BETWEEN $2::date AND $3::date ORDER BY date",
      [id, start, end],
    )
  ).rows;
const savePayload = (occurred_at, entries, status = "success", extra = {}) => ({
  occurred_at,
  status,
  payment_method: "direct",
  payment_id: "",
  merchant: "balance-history-validation",
  notes: "",
  entries,
  ...extra,
});
const pair = (dr, cr, amount) => [
  { direction: "借", account_id: dr.id, amount: String(amount) },
  { direction: "贷", account_id: cr.id, amount: String(amount) },
];
const fpSql = `
WITH vals AS (
  SELECT 'account' table_name,count(*)::bigint n,
    md5(coalesce(string_agg(format('%s|%s|%s|%s|%s',id,type::text,subtype,name,notes),E'\\n' ORDER BY id),'')) fingerprint
  FROM financial.account
  UNION ALL
  SELECT 'transaction',count(*)::bigint,
    md5(coalesce(string_agg(format('%s|%s|%s|%s|%s|%s|%s|%s|%s',id,to_char(occurred_at,'YYYY-MM-DD HH24:MI:SS.USOF'),to_char(created_at,'YYYY-MM-DD HH24:MI:SS.USOF'),to_char(updated_at,'YYYY-MM-DD HH24:MI:SS.USOF'),status::text,payment_method,payment_id,notes,merchant),E'\\n' ORDER BY id),''))
  FROM financial.transaction
  UNION ALL
  SELECT 'entry',count(*)::bigint,
    md5(coalesce(string_agg(format('%s|%s|%s|%s|%s',id,transaction_id,direction::text,account_id,amount::text),E'\\n' ORDER BY id),''))
  FROM financial.entry
)
SELECT table_name,n,fingerprint FROM vals ORDER BY table_name`;

async function main() {
  await db.connect();
  const before = (await q(fpSql)).rows;
  note("base_before", before);
  const baseCols = (
    await q(
      "SELECT table_name,string_agg(column_name,',' ORDER BY ordinal_position) columns FROM information_schema.columns WHERE table_schema='financial' AND table_name IN ('account','transaction','entry') GROUP BY table_name ORDER BY table_name",
    )
  ).rows;
  note("base_columns", baseCols);
  assert.deepEqual(baseCols, [
    { table_name: "account", columns: "type,subtype,name,notes,id" },
    {
      table_name: "entry",
      columns: "id,transaction_id,direction,account_id,amount",
    },
    {
      table_name: "transaction",
      columns:
        "id,occurred_at,created_at,updated_at,status,payment_method,payment_id,notes,merchant",
    },
  ]);
  assert.equal(
    (
      await q(
        "SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='financial' AND table_type='BASE TABLE'",
      )
    ).rows[0].n,
    3,
  );
  checks += 2;

  const objectRows = (
    await q(`SELECT c.relname,c.relkind,c.reloptions,
    CASE WHEN c.relkind='m' THEN pg_get_viewdef(c.oid,true) END definition
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='financial' AND c.relname IN ('balance','balance_history','balance_read','balance_history_read','cashflow_read','cashflow_daily','home') ORDER BY c.relname`)
  ).rows;
  note(
    "objects",
    objectRows.map((r) => ({
      name: r.relname,
      kind: r.relkind,
      options: r.reloptions,
    })),
  );
  const byName = Object.fromEntries(objectRows.map((r) => [r.relname, r]));
  for (const name of ["balance", "balance_history"])
    assert.equal(byName[name]?.relkind, "m", name);
  for (const name of [
    "balance_read",
    "balance_history_read",
    "cashflow_read",
    "cashflow_daily",
    "home",
  ])
    assert.equal(byName[name], undefined, name);
  checks += 7;

  const funcs = (
    await q(`SELECT p.oid::regprocedure::text signature, p.prosecdef,
    p.proconfig, pg_get_functiondef(p.oid) definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='financial' AND p.proname IN ('save_transaction','save_account','refresh_balances','read_balance','read_balance_history') ORDER BY 1`)
  ).rows;
  note(
    "functions",
    funcs.map((r) => ({
      signature: r.signature,
      prosecdef: r.prosecdef,
      proconfig: r.proconfig,
      has_refresh: r.definition.includes("financial.refresh_balances()"),
    })),
  );
  const saveFns = funcs.filter((r) => /(?:^|\.)save_/.test(r.signature));
  assert.equal(saveFns.length, 2);
  for (const f of saveFns) {
    assert.equal(f.prosecdef, true, f.signature);
    assert.ok(f.proconfig?.includes("search_path=pg_catalog"), f.signature);
    assert.ok(
      f.definition.includes("financial.refresh_balances()"),
      f.signature,
    );
  }
  checks += 6;

  await q("BEGIN");
  await q("SET LOCAL ROLE superadmin");
  stage = "save_account cash";
  const cash = await rpc("save_account", [
    null,
    { type: "资产", subtype: "现金及等价物", name: "验证现金" },
  ]);
  stage = "save_account investment";
  const investment = await rpc("save_account", [
    null,
    { type: "资产", subtype: "交易性金融资产", name: "验证投资" },
  ]);
  stage = "save_account income";
  const income = await rpc("save_account", [
    null,
    { type: "收入", subtype: "验证收入", name: "验证收入" },
  ]);
  stage = "save_account expense";
  const expense = await rpc("save_account", [
    null,
    { type: "支出", subtype: "验证支出", name: "验证支出" },
  ]);
  for (const a of [cash, investment, income, expense])
    assert.ok(a?.id, "account saved");
  checks++;

  // First two entries deliberately straddle a Beijing calendar boundary.
  stage = "save_transaction crossA";
  const crossA = await rpc("save_transaction", [
    null,
    null,
    savePayload("2026-09-10T23:59:59+08:00", pair(cash, income, "100.00")),
  ]);
  stage = "save_transaction crossB";
  const crossB = await rpc("save_transaction", [
    null,
    null,
    savePayload("2026-09-11T00:00:01+08:00", pair(investment, cash, "30.00")),
  ]);
  assert.ok(crossA.id && crossB.id);
  const crossRows = await history(cash.id, "2026-09-10", "2026-09-12");
  assert.equal(
    crossRows.find((r) => r.date === "2026-09-10")?.balance,
    "100.00",
  );
  assert.equal(
    crossRows.find((r) => r.date === "2026-09-11")?.balance,
    "70.00",
  );
  assert.equal(
    crossRows.find((r) => r.date === "2026-09-12")?.balance,
    "70.00",
  );
  checks += 4;

  // A pending transaction is valid for the balance materialization but excluded from cashflow.
  const cashflowBeforePending = (
    await q(
      "SELECT coalesce(sum(net::numeric),0)::text net FROM financial.cashflow WHERE occurred_at >= '2026-09-13T00:00:00+08:00' AND occurred_at < '2026-09-14T00:00:00+08:00'",
    )
  ).rows[0].net;
  stage = "save_transaction pending";
  const pending = await rpc("save_transaction", [
    null,
    null,
    savePayload(
      "2026-09-13T12:00:00+08:00",
      pair(cash, income, "7.00"),
      "pending",
    ),
  ]);
  const pendingBalance = await balance(cash.id);
  assert.equal(pendingBalance, "77.00");
  assert.equal(
    (
      await q(
        "SELECT count(*)::int n FROM financial.cashflow WHERE transaction_id=$1",
        [pending.id],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await q(
        "SELECT coalesce(sum(net::numeric),0)::text net FROM financial.cashflow WHERE occurred_at >= '2026-09-13T00:00:00+08:00' AND occurred_at < '2026-09-14T00:00:00+08:00'",
      )
    ).rows[0].net,
    cashflowBeforePending,
  );
  checks += 3;

  // Same transaction refund: original expense 20, then add an 8 refund entry.
  stage = "save_transaction refund";
  const refund = await rpc("save_transaction", [
    null,
    null,
    savePayload("2026-09-13T13:00:00+08:00", pair(expense, cash, "20.00")),
  ]);
  const refundEntries = [...refund.entries, ...pair(cash, expense, "8.00")];
  const refundUpdated = await rpc("save_transaction", [
    refund.id,
    refund.updated_at,
    savePayload("2026-09-13T13:00:00+08:00", refundEntries, "partial_refund"),
  ]);
  assert.equal(refundUpdated.id, refund.id);
  assert.equal(
    (
      await q(
        "SELECT net::numeric::text net FROM financial.cashflow WHERE transaction_id=$1",
        [refund.id],
      )
    ).rows[0].net,
    "-12.00",
  );
  checks += 2;

  // Back-edit an earlier transaction and verify every later daily row is recomputed.
  stage = "save_transaction backedit insert";
  const back = await rpc("save_transaction", [
    null,
    null,
    savePayload("2026-09-08T12:00:00+08:00", pair(cash, income, "5.00")),
  ]);
  const beforeEdit = await history(cash.id, "2026-09-08", "2026-09-14");
  const editedEntries = back.entries.map((e) => ({ ...e, amount: "11.00" }));
  stage = "save_transaction backedit update";
  const backUpdated = await rpc("save_transaction", [
    back.id,
    back.updated_at,
    savePayload("2026-09-08T12:00:00+08:00", editedEntries),
  ]);
  assert.equal(backUpdated.id, back.id);
  const afterEdit = await history(cash.id, "2026-09-08", "2026-09-14");
  for (const row of afterEdit) {
    const previous = beforeEdit.find((r) => r.date === row.date);
    assert.equal(
      (
        BigInt(row.balance.replace(".", "")) -
        BigInt(previous.balance.replace(".", ""))
      ).toString(),
      "600",
    );
  }
  checks += 2 + afterEdit.length;

  // The signed role is resolved by Data API; direct database reads need no JWT claims.
  assert.ok(
    (await q("SELECT count(*)::int n FROM financial.balance_history")).rows[0]
      .n > 0,
  );
  checks++;

  const continuity = (
    await q(`WITH per AS (
    SELECT id,min(date) first_date,max(date) last_date,count(*)::bigint rows,
      (max(date)-min(date)+1)::bigint expected FROM financial.balance_history GROUP BY id
  ) SELECT count(*) FILTER (WHERE rows<>expected)::int gaps,count(*)::int accounts FROM per`)
  ).rows[0];
  assert.equal(continuity.gaps, 0);
  assert.ok(continuity.accounts > 0);
  const latestMismatch = (
    await q(`WITH latest AS (
    SELECT DISTINCT ON (id) id,balance::numeric FROM financial.balance_history ORDER BY id,date DESC
  ) SELECT count(*)::int n FROM latest l JOIN financial.balance b USING (id) WHERE l.balance<>b.balance::numeric`)
  ).rows[0].n;
  assert.equal(latestMismatch, 0);
  checks += 2;

  const historySize = (
    await q("SELECT count(*)::int n FROM financial.balance_history")
  ).rows[0].n;
  await rpc("save_transaction", [
    null,
    null,
    savePayload("2090-01-01T00:00:00+08:00", pair(cash, income, "1.00")),
  ]);
  assert.equal(
    (await q("SELECT count(*)::int n FROM financial.balance_history")).rows[0]
      .n,
    historySize,
  );
  assert.equal(
    (
      await q(
        "SELECT max(date)<=(current_timestamp AT TIME ZONE 'Asia/Shanghai')::date ok FROM financial.balance_history",
      )
    ).rows[0].ok,
    true,
  );
  checks += 2;
  await q("ROLLBACK");
  const after = (await q(fpSql)).rows;
  note("base_after_rollback", after);
  assert.deepEqual(after, before);
  checks++;
  const tableCount = (
    await q(
      "SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='financial' AND table_type='BASE TABLE'",
    )
  ).rows[0].n;
  assert.equal(tableCount, 3);
  checks++;
  note("checks", checks);
  console.log(
    `PASS ${checks} checks; migration objects, base-table fingerprints, daily carry, pending/refund/back-edit, and direct role access verified; test writes rolled back`,
  );
}

main()
  .catch(async (e) => {
    try {
      await q("ROLLBACK");
    } catch {}
    console.error(`${e.code ?? ""} ${e.message} [stage=${e.stage ?? stage}]`);
    process.exitCode = 1;
  })
  .finally(() => db.end());
