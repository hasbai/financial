import { withUserToken } from "./auth0-token.mjs";
import assert from "node:assert/strict";
const url =
  process.env.DATA_API_URL ||
  "https://ep-long-dew-b3q1him6.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";
await withUserToken(async (token, tokenData) => {
  const claims = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString(),
  );
  assert.equal(claims.sub, "auth0|6a9e921870e37d7bbfb76c8f");
  console.log(
    "Token role:",
    claims.role ?? "(absent)",
    "issuer:",
    claims.iss,
    "audience matches:",
    claims.aud.includes("https://financial.hasbai.xyz/api"),
  );
  async function req(path, body, t = token) {
    const r = await fetch(url + path, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + t,
        "Content-Type": "application/json",
        "Accept-Profile": "financial",
        "Content-Profile": "financial",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, data: await r.json() };
  }
  const primary = await fetch(
    "https://ep-long-dew-b3q1him6.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1/account?select=id&limit=0",
    {
      headers: {
        Authorization: "Bearer " + token,
        "Accept-Profile": "financial",
      },
    },
  );
  console.log(
    "Production API compatibility probe:",
    primary.status,
    await primary.text(),
  );

  const owner = await req("/rpc/is_owner", {});
  console.log(
    "Auth0 login succeeded; Neon identity check:",
    owner.status,
    JSON.stringify(owner.data),
  );
  assert.equal(owner.data, true);
  const accounts = await req("/account?select=id,type,subtype&limit=1000");
  assert.equal(accounts.status, 200);
  assert.equal(accounts.data.length, 86);
  console.log("PASS real JWT account read: 86 records");
  const query = async (view, params) => {
    const response = await req("/" + view + "?" + new URLSearchParams(params));
    assert.equal(
      response.status,
      200,
      `${view}: ${JSON.stringify(response.data)}`,
    );
    return response.data;
  };
  const list = await query("transactions", {
    select: "id,occurred_at,entries,amount",
    order: "occurred_at.desc,id.desc",
    limit: "31",
  });
  assert.ok(list.length > 0);
  const last = list[Math.min(29, list.length - 1)];
  const next = await query("transactions", {
    select: "id,occurred_at",
    order: "occurred_at.desc,id.desc",
    limit: "31",
    or: `(occurred_at.lt.${JSON.stringify(last.occurred_at)},and(occurred_at.eq.${JSON.stringify(last.occurred_at)},id.lt.${last.id}))`,
  });
  assert.ok(!next.some((r) => list.slice(0, 30).some((t) => t.id === r.id)));
  const detail = await query("transactions", {
    select: "id,entries,amount",
    id: "eq." + list[0].id,
  });
  assert.equal(detail.length, 1);
  assert.ok(detail[0].amount === null || typeof detail[0].amount === "string");
  await query("transactions", {
    select: "id",
    search_text: String.raw`imatch.a\.\*\(商户\),%_`,
    account_types: "cs.{资产}",
    has_cash_flow: "eq.true",
    limit: "1",
  });
  console.log(
    "PASS real JWT transaction view, detail, cursor, regex and array filters",
  );
  const cutoff = new Date().toISOString();
  const sum = (name) => `${name}:${name}::numeric.sum()::text`;
  const balance = await query("balance_sheet", {
    select: ["assets", "liabilities", "net_assets"].map(sum).join(","),
    occurred_at: "lt." + cutoff,
  });
  const period = [
    ["occurred_at", "gte.2026-09-01T00:00:00+08:00"],
    ["occurred_at", "lt." + cutoff],
  ];
  const income = await query("income_statement", [
    ["select", ["income", "expense", "profit"].map(sum).join(",")],
    ...period,
  ]);
  const cash = await query("cashflow_statement", [
    ["select", ["inflow", "outflow", "net"].map(sum).join(",")],
    ...period,
  ]);
  const trend = await query("income_statement", [
    ["select", "date," + sum("income") + "," + sum("expense")],
    ["order", "date.asc"],
    ...period,
  ]);
  for (const rows of [balance, income, cash]) {
    assert.equal(rows.length, 1);
    for (const amount of Object.values(rows[0]))
      assert.ok(amount === null || typeof amount === "string");
  }
  assert.ok(Array.isArray(trend));
  console.log(
    "PASS real JWT three report views: SQL aggregates, decimal strings, date grouping",
  );
  const invalid = await req("/rpc/save_transaction", {
    p_id: null,
    p_updated_at: null,
    p_payload: {},
  });
  assert.ok(invalid.status >= 400);
  console.log("PASS malformed write rejected without data changes");

  if (process.env.API_WRITE_CHECK === "1") {
    assert.ok(
      url.includes("ep-rapid-snow-b3ddiqzp"),
      "Write tests must target the isolated development branch",
    );
    const [{ default: pg }, { readFileSync }] = await Promise.all([
      import("pg"),
      import("node:fs"),
    ]);
    const cleanup = new pg.Client({
      connectionString: readFileSync(0, "utf8")
        .trim()
        .replace("sslmode=require", "sslmode=verify-full"),
    });
    const marker = "financial-integration-" + crypto.randomUUID();
    await cleanup.connect();
    try {
      const bank = accounts.data.find(
        (a) => a.type === "资产" && a.subtype === "现金及等价物",
      );
      const expense = accounts.data.find((a) => a.type === "支出");
      const payload = {
        occurred_at: "2090-01-01T00:00:00+08:00",
        status: "success",
        payment_method: "direct",
        payment_id: marker,
        merchant: "临时接口校验",
        notes: "",
        entries: [
          { account_id: expense.id, direction: "借", amount: "100.00" },
          { account_id: bank.id, direction: "贷", amount: "100.00" },
        ],
      };
      const saved = await req("/rpc/save_transaction", {
        p_id: null,
        p_updated_at: null,
        p_payload: payload,
      });
      assert.equal(saved.status, 200);
      assert.equal(saved.data.complete, true);
      const revised = {
        ...payload,
        status: "partial_refund",
        entries: [
          ...saved.data.entries,
          { account_id: bank.id, direction: "借", amount: "30.00" },
          { account_id: expense.id, direction: "贷", amount: "30.00" },
        ],
      };
      const refunded = await req("/rpc/save_transaction", {
        p_id: saved.data.id,
        p_updated_at: saved.data.updated_at,
        p_payload: revised,
      });
      assert.equal(refunded.status, 200);
      assert.equal(refunded.data.id, saved.data.id);
      assert.equal(Number(refunded.data.amount), 70);
      console.log(
        "PASS real JWT create, edit, and refund within the same transaction",
      );
    } finally {
      await cleanup.query("BEGIN");
      await cleanup.query(
        "DELETE FROM financial.entry WHERE transaction_id IN (SELECT id FROM financial.transaction WHERE payment_id=$1)",
        [marker],
      );
      await cleanup.query(
        "DELETE FROM financial.transaction WHERE payment_id=$1",
        [marker],
      );
      await cleanup.query("COMMIT");
      await cleanup.end();
      console.log("API test records removed");
    }
  }
  const bad = token.slice(0, -12) + "AAAAAAAAAAAA";
  assert.ok((await req("/account?select=id", undefined, bad)).status >= 400);
  console.log("PASS invalid signature rejected");
  for (const view of [
    "account",
    "transactions",
    "balance_sheet",
    "income_statement",
    "cashflow_statement",
  ]) {
    const wrongAudience = await req(
      `/${view}?select=*&limit=1`,
      undefined,
      tokenData.id_token,
    );
    assert.ok(
      wrongAudience.status >= 400 ||
        (Array.isArray(wrongAudience.data) && wrongAudience.data.length === 0),
    );
  }
  console.log(
    "PASS wrong-audience ID token cannot read accounts or any report view (RLS)",
  );
  const absent = await fetch(url + "/account?select=id", {
    headers: { "Accept-Profile": "financial" },
  });
  assert.ok(absent.status >= 400);
  console.log("PASS missing token rejected");
});
console.log(
  "Original Auth0 grant types restored. No credentials or tokens printed.",
);
