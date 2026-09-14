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
