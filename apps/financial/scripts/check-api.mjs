import { withUserToken } from "./auth0-token.mjs";
import assert from "node:assert/strict";
const url =
  process.env.DATA_API_URL ||
  "https://ep-long-dew-b3q1him6.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";
await withUserToken(async (token, tokenData) => {
  const claims = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString(),
  );
  assert.equal(
    claims.role,
    "superadmin",
    "Auth0 role claim must map to the database role",
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
  const accounts = await req("/account?select=id,type,subtype&limit=1000");
  assert.equal(accounts.status, 200);
  assert.ok(Array.isArray(accounts.data));
  assert.ok(accounts.data.every((a) => Number.isSafeInteger(a.id)));
  console.log(`PASS real JWT account read: ${accounts.data.length} records`);
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
  for (const [view, select] of [
    ["balance", "id,balance::text"],
    ["balance_history", "date,id,balance::text"],
    ["cashflow", "transaction_id,occurred_at,net::text"],
    ["income_statement", "occurred_at,type,subtype,income,expense,profit"],
  ]) {
    const rows = await query(view, { select, limit: "1000" });
    assert.ok(Array.isArray(rows));
    for (const row of rows)
      for (const key of ["balance", "net", "income", "expense", "profit"])
        if (key in row) assert.equal(typeof row[key], "string");
  }
  console.log("PASS real JWT direct report reads and decimal strings");
  const invalid = await req("/rpc/save_transaction", {
    p_id: null,
    p_updated_at: null,
    p_payload: {},
  });
  assert.ok(invalid.status >= 400);
  console.log("PASS malformed write rejected without data changes");

  for (const [name, body] of [
    ["delete_account", { p_id: -1 }],
    ["delete_transaction", { p_id: -1, p_updated_at: null }],
    [
      "save_account",
      {
        p_id: null,
        p_payload: { id: 1, type: "资产", subtype: "测试", name: "测试" },
      },
    ],
  ]) {
    const response = await req("/rpc/" + name, body);
    assert.equal(response.status, 400);
    assert.match(response.data.message, /CONFLICT|五位/);
  }
  console.log(
    "PASS account-ID and deletion RPCs reachable with real JWT; invalid writes rejected",
  );
  const bad = token.slice(0, -12) + "AAAAAAAAAAAA";
  assert.ok((await req("/account?select=id", undefined, bad)).status >= 400);
  console.log("PASS invalid signature rejected");
  for (const view of [
    "account",
    "transactions",
    "balance",
    "balance_history",
    "income_statement",
    "cashflow",
  ]) {
    const wrongAudience = await req(
      `/${view}?select=*&limit=1`,
      undefined,
      tokenData.id_token,
    );
    assert.ok([400, 401, 403].includes(wrongAudience.status));
  }
  console.log(
    "PASS wrong-audience ID token cannot read accounts or any report view (gateway)",
  );
  const absent = await fetch(url + "/account?select=id", {
    headers: { "Accept-Profile": "financial" },
  });
  assert.ok(absent.status >= 400);
  console.log("PASS missing token rejected");
});
console.log(
  "Auth0 normal Authorization Code + PKCE flow completed. No credentials or tokens printed; the access token remained in memory and Auth0 configuration was not modified.",
);
