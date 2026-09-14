import { afterEach, describe, expect, it, vi } from "vitest";
import { createRepository, ApiError, errorMessage } from "./api";
import type { Payload } from "./types";
afterEach(() => vi.unstubAllGlobals());
describe("Data API contract", () => {
  it("uses financial profile and a fresh token, without SQL or credentials", async () => {
    const requests: { url: string; headers: Headers; body: string }[] = [];
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push({
          url: String(input),
          headers: new Headers(init?.headers),
          body: String(init?.body || ""),
        });
        return new Response(JSON.stringify({ id: 7 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );
    const repo = createRepository(async () => "test-user-token");
    await repo.save(null, null, {
      entries: [{ account_id: 1, direction: "借", amount: "0.10" }],
    } as Payload);
    expect(requests[0].url).toContain("/rpc/save_transaction");
    expect(requests[0].headers.get("content-profile")).toBe("financial");
    expect(requests[0].headers.get("authorization")).toBe(
      "Bearer test-user-token",
    );
    expect(JSON.parse(requests[0].body).p_payload.entries[0].amount).toBe(
      "0.10",
    );
    expect(requests[0].body).not.toContain("p_ledger");
  });
  it("preserves conflict details for the editor", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ code: "P0001", message: "CONFLICT" }), {
          status: 400,
        }),
    );
    const repo = createRepository(async () => "test");
    await expect(repo.transaction(7)).rejects.toBeInstanceOf(ApiError);
    expect(errorMessage(new Error("CONFLICT"))).toBe("记录已更新");
  });
});

describe("read views", () => {
  function mockApi(respond: (url: URL, headers: Headers) => unknown) {
    const requests: URL[] = [];
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        const headers = new Headers(init?.headers);
        requests.push(url);
        expect(init?.method ?? "GET").toBe("GET");
        expect(headers.get("accept-profile")).toBe("financial");
        expect(headers.get("authorization")).toBe("Bearer owner-token");
        expect(url.pathname).not.toContain("/rpc/");
        return new Response(JSON.stringify(respond(url, headers)), {
          headers: { "content-type": "application/json" },
        });
      },
    );
    return { repo: createRepository(async () => "owner-token"), requests };
  }
  it("filters and keyset-pages the transaction view without a count query", async () => {
    const at = "2026-09-14T02:00:00.123456+00:00";
    const rows = Array.from({ length: 31 }, (_, i) => ({
      id: 100 - i,
      occurred_at: at,
      amount: "0.10",
    }));
    const { repo, requests } = mockApi(() => rows);
    const result = await repo.list(
      {
        start: at,
        end: "2026-10-01",
        search: "a.*(商户),%_",
        review: "needed",
        status: "success",
        payment_method: "direct",
        posted: "true",
        account_id: "7",
        account_type: "资产",
        cash: "true",
        matched: "true",
      },
      { occurred_at: at, id: 101 },
    );
    expect(result.items).toHaveLength(30);
    expect(result.next_cursor).toEqual({ occurred_at: at, id: 71 });
    const params = requests[0].searchParams;
    expect(requests).toHaveLength(1);
    expect(params.get("limit")).toBe("31");
    expect(params.get("search_text")).toBe("imatch.a\\.\\*\\(商户\\),%_");
    expect(params.get("needs_review")).toBe("eq.true");
    expect(params.get("status")).toBe("eq.success");
    expect(params.get("payment_method")).toBe("eq.direct");
    expect(params.get("account_ids")).toBe("cs.{7}");
    expect(params.get("account_types")).toBe("cs.{资产}");
    expect(params.get("has_cash_flow")).toBe("eq.true");
    expect(params.get("missing_accounts")).toBe("eq.0");
    expect(params.get("entry_count")).toBe("gt.0");
    expect(params.get("posted_count")).toBe("eq.1");
    expect(params.get("order")).toBe("occurred_at.desc,id.desc");
    expect(params.get("or")).toContain(`occurred_at.eq."${at}",id.lt.101`);
  });
  it("returns no cursor at an exact page boundary and null for a missing detail", async () => {
    const { repo, requests } = mockApi((url) =>
      url.searchParams.has("id")
        ? []
        : Array.from({ length: 30 }, (_, id) => ({ id })),
    );
    expect(
      (await repo.list({ review: "unmatched" }, null)).next_cursor,
    ).toBeNull();
    expect(requests[0].searchParams.get("missing_accounts")).toBe("gt.0");
    expect(await repo.transaction(9)).toBeNull();
    expect(requests[1].searchParams.get("id")).toBe("eq.9");
    await expect(
      repo.list({}, { occurred_at: "invalid", id: 1 }),
    ).rejects.toBeInstanceOf(ApiError);
  });
  it("keeps SQL decimal strings and queries only cash or balances for charts", async () => {
    const { repo, requests } = mockApi((url) =>
      url.pathname.endsWith("cashflow_read")
        ? {
            cash_in: "9007199254740993.01",
            cash_out: "0.02",
            cash_net: "9007199254740992.99",
          }
        : {
            assets: "100.00",
            liabilities: "200.00",
            net_assets: "-100.00",
            cash_closing: "30.00",
          },
    );
    const cash = await repo.cashflow(
      "2026-09-01",
      "2026-10-01",
      "2026-09-14T02:00:00Z",
    );
    expect(cash.cash_net).toBe("9007199254740992.99");
    expect(requests[0].searchParams.getAll("occurred_at")).toEqual([
      "gte.2026-09-01",
      "lt.2026-09-14T02:00:00Z",
    ]);
    expect(requests[0].searchParams.get("select")).toContain(
      "::numeric.sum()::text",
    );
    expect((await repo.balance("2026-09-14")).net_assets).toBe("-100.00");
    expect(requests).toHaveLength(2);
  });
  it("reads the latest balance MV during the current day and a single closing day for history", async () => {
    const { repo, requests } = mockApi(() => ({
      assets: "0",
      liabilities: "0",
      net_assets: "0",
      cash_closing: "0",
    }));
    await repo.balance(new Date().toISOString());
    expect(requests[0].pathname).toMatch(/\/balance_read$/);
    expect(requests[0].searchParams.has("date")).toBe(false);
    await repo.balance("2020-10-01T00:00:00+08:00");
    expect(requests[1].pathname).toMatch(/\/balance_history_read$/);
    expect(requests[1].searchParams.get("date")).toBe("eq.2020-09-30");
  });
  it("preserves sub-millisecond report boundaries", async () => {
    const { repo, requests } = mockApi(() => ({
      cash_in: null,
      cash_out: null,
      cash_net: null,
    }));
    await repo.cashflow(
      "2026-09-01",
      "2026-09-14T02:00:00.123456Z",
      "2026-09-14T10:00:00.123455+08:00",
    );
    expect(requests[0].searchParams.getAll("occurred_at")).toContain(
      "lt.2026-09-14T10:00:00.123455+08:00",
    );
  });
  it("assembles empty aggregate results without inventing rows or using read RPCs", async () => {
    const { repo, requests } = mockApi((url, headers) =>
      headers.get("accept")?.includes("object")
        ? { pending: null, coverage_start: null }
        : [],
    );
    const result = await repo.overview(
      "2026-09-01",
      "2026-10-01",
      "2026-09-14",
    );
    expect(result.assets).toBe("0");
    expect(result.cash_net).toBe("0");
    expect(result.profit).toBe("0");
    expect(result.accounts).toEqual([]);
    expect(result.trend).toEqual([]);
    expect(result.quality.pending).toBe(0);
    expect(result.quality.coverage_start).toBeNull();
    expect(new Set(requests.map((r) => r.pathname.split("/").at(-1)))).toEqual(
      new Set([
        "balance_history_read",
        "income_statement",
        "cashflow_read",
        "transactions",
      ]),
    );
  });
  it("fetches all grouped rows beyond the API cap and preserves decimal category ordering", async () => {
    const { repo, requests } = mockApi((url, headers) => {
      const select = url.searchParams.get("select") ?? "";
      if (
        url.pathname.endsWith("income_statement") &&
        select.startsWith("date,")
      ) {
        return url.searchParams.get("offset") === "0"
          ? Array.from({ length: 1000 }, (_, n) => ({
              date: String(n),
              income: "0.00",
              expense: "0.00",
            }))
          : [{ date: "1000", income: "0.00", expense: "0.00" }];
      }
      if (select.startsWith("name:subtype"))
        return [
          { name: "a", type: "收入", amount: "9007199254740993.01" },
          { name: "b", type: "支出", amount: "9007199254740993.02" },
        ];
      return headers.get("accept")?.includes("object")
        ? { coverage_start: null }
        : [];
    });
    const result = await repo.overview(
      "2020-01-01",
      "2026-10-01",
      "2026-09-14",
    );
    expect(result.trend).toHaveLength(1001);
    expect(result.categories.map((c) => c.name)).toEqual(["b", "a"]);
    expect(requests.some((r) => r.searchParams.get("offset") === "1000")).toBe(
      true,
    );
  });
  it("rejects the whole report when one view fails", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({ code: "42501", message: "permission denied" }),
          { status: 403 },
        ),
    );
    await expect(
      createRepository(async () => "token").overview(
        "2026-09-01",
        "2026-10-01",
        "2026-09-14",
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
