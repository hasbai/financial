import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { identity } from "./auth";
import worker, { normalizeTrafficPayload, renderTemplate } from "./index";
import { clientConfig, subscription } from "./subscription";
import { parse } from "yaml";
vi.mock("./auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./auth")>()),
  identity: vi.fn(),
}));
let db: DatabaseSync;
let env: Env;
const client = {
  server: "node.example.com",
  port: 443,
  security: "tls",
  network: "tcp",
};
function statement(sql: string, values: unknown[] = []): D1PreparedStatement {
  return {
    bind: (...args: unknown[]) => statement(sql, args),
    first: async () => db.prepare(sql).get(...(values as never[])) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(values as never[])) }),
    run: async () => {
      const result = db.prepare(sql).run(...(values as never[]));
      return {
        meta: {
          last_row_id: Number(result.lastInsertRowid),
          changes: Number(result.changes),
        },
      };
    },
  } as D1PreparedStatement;
}
async function call(path: string, method = "GET", body?: unknown) {
  return worker.fetch(
    new Request("https://zboard.test" + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }),
    env,
  );
}
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  for (const name of [
    "0001_schema.sql",
    "0002_seed.sql",
    "0003_auth0_subscriptions.sql",
    "0004_clash_template.sql",
  ])
    db.exec(
      readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8"),
    );
  env = {
    DB: {
      prepare: statement,
      batch: async (stmts: D1PreparedStatement[]) => {
        db.exec("BEGIN");
        try {
          const r = [];
          for (const s of stmts) r.push(await s.run());
          db.exec("COMMIT");
          return r;
        } catch (e) {
          db.exec("ROLLBACK");
          throw e;
        }
      },
    },
    AUTH0_DOMAIN: "hasbai.eu.auth0.com",
    AUTH0_AUDIENCE: "https://zboard.hasbai.xyz/api",
  } as Env;
  vi.mocked(identity).mockResolvedValue({
    sub: "auth0|admin",
    email: "admin@example.com",
    admin: true,
  });
});
afterEach(() => {
  db.close();
  vi.clearAllMocks();
});
async function seed() {
  await call("/api/me");
  await call("/api/admin/users/1", "PATCH", { enabled: true });
  const r = await call("/api/admin/nodes", "POST", {
    name: "东京",
    client,
    config: { server_port: 443, private_key: "server-secret" },
  });
  const { id, token } = (await r.json()) as { id: number; token: string };
  await call(`/api/admin/nodes/${id}/users/1`, "POST");
  return { id, token };
}
describe("D1 panel and node contracts", () => {
  it("provisions a disabled Auth0 identity once; never auto-links by email", async () => {
    const r = await call("/api/me");
    expect(r.status).toBe(200);
    const me = (await r.json()) as {
      user: { enabled: number };
      subscription_url: null;
    };
    expect(me.user.enabled).toBe(0);
    expect(me.subscription_url).toBeNull();
    await call("/api/me");
    expect(db.prepare("SELECT count(*) n FROM users").get()?.n).toBe(1);
    vi.mocked(identity).mockResolvedValue({
      sub: "auth0|other",
      email: "admin@example.com",
      admin: false,
    });
    expect((await call("/api/me")).status).toBe(409);
  });
  it("denies all administrative actions to a normal user", async () => {
    vi.mocked(identity).mockResolvedValue({
      sub: "auth0|u",
      email: "u@example.com",
      admin: false,
    });
    for (const method of ["GET", "POST", "DELETE"])
      expect((await call("/api/admin/nodes", method)).status).toBe(403);
  });
  it("exposes only own subscription and rotates it immediately", async () => {
    await seed();
    const me = (await (await call("/api/me")).json()) as {
      subscription_url: string;
    };
    const path = new URL(me.subscription_url).pathname;
    let r = await call(path + "?format=uri");
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).toContain("vless://");
    expect(text).not.toContain("server-secret");
    vi.mocked(identity).mockResolvedValue({
      sub: "auth0|other",
      email: "other@example.com",
      admin: false,
    });
    const other = (await (await call("/api/me")).json()) as {
      subscription_url: null;
      nodes: unknown[];
    };
    expect(other.subscription_url).toBeNull();
    expect(other.nodes).toEqual([]);
    vi.mocked(identity).mockResolvedValue({
      sub: "auth0|admin",
      email: "admin@example.com",
      admin: true,
    });
    await call("/api/me/rotate", "POST");
    expect((await call(path)).status).toBe(404);
  });
  it("filters node assignments and blocks disabled, expired or exhausted subscriptions", async () => {
    await seed();
    const me = (await (await call("/api/me")).json()) as {
      subscription_url: string;
    };
    const path = new URL(me.subscription_url).pathname;
    for (const update of [
      { enabled: false },
      { enabled: true, expired_at: 1 },
      { expired_at: null, transfer_enable: 1 },
    ]) {
      await call("/api/admin/users/1", "PATCH", update);
      if ("transfer_enable" in update) db.exec("UPDATE users SET upload=1");
      expect((await call(path)).status).toBe(404);
    }
  });
  it("zero traffic writes nothing, positive traffic is atomic and bound-user only", async () => {
    const { id, token } = await seed();
    const path = `/api/v1/server/UniProxy/push?node_id=${id}&token=${token}`;
    expect((await call(path, "POST", { "1": [0, 0] })).status).toBe(200);
    expect(db.prepare("SELECT count(*) n FROM node_reports").get()?.n).toBe(0);
    expect(
      (await call(path, "POST", { "1": [20, 30], "999": [100, 100] })).status,
    ).toBe(200);
    expect(
      db.prepare("SELECT upload,download FROM users WHERE id=1").get(),
    ).toEqual({ upload: 20, download: 30 });
    expect(db.prepare("SELECT count(*) n FROM node_reports").get()?.n).toBe(1);
    expect((await call(path, "POST", { "1": [-1, 2] })).status).toBe(400);
    expect(
      (await call(path.replace(token, "wrong"), "POST", { "1": [1, 1] }))
        .status,
    ).toBe(401);
  });
  it("rechecks eligibility before conditional user responses", async () => {
    const { id, token } = await seed();
    const path = `/api/v1/server/UniProxy/user?node_id=${id}&token=${token}`;
    const r = await call(path);
    const etag = r.headers.get("ETag")!;
    const poll = () =>
      worker.fetch(
        new Request("https://zboard.test" + path, {
          headers: { "If-None-Match": etag },
        }),
        env,
      );
    expect((await poll()).status).toBe(304);
    db.exec("UPDATE users SET expired_at=1");
    const next = await poll();
    expect(next.status).toBe(200);
    expect(await next.json()).toEqual({ users: [] });
  });
  it("keeps node secrets out of list responses and validates JSON/limits", async () => {
    await seed();
    const list = await (await call("/api/admin/nodes")).text();
    expect(list).not.toContain("token");
    expect(list).not.toContain("server-secret");
    expect(
      (await call("/api/admin/users/1", "PATCH", { transfer_enable: -1 }))
        .status,
    ).toBe(400);
    expect(
      (
        await call("/api/admin/templates", "POST", {
          name: "bad",
          protocol: "vless",
          template_json: "{",
        })
      ).status,
    ).toBe(400);
  });
  it("restricts and saves the Clash template and override", async () => {
    vi.mocked(identity).mockResolvedValue({
      sub: "auth0|member",
      email: "member@example.com",
      admin: false,
    });
    expect((await call("/api/admin/clash")).status).toBe(403);
    vi.mocked(identity).mockResolvedValue({
      sub: "auth0|admin",
      email: "admin@example.com",
      admin: true,
    });
    const original = (await (await call("/api/admin/clash")).json()) as {
      template_yaml: string;
      override_yaml: string;
    };
    expect(original.template_yaml).toContain("本站节点");
    expect(
      (await call("/api/admin/clash", "PUT", {
        ...original,
        override_yaml: "proxy-groups: [broken]",
      })).status,
    ).toBe(400);
    expect(
      (await call("/api/admin/clash", "PUT", {
        ...original,
        override_yaml: "dns:\n  enable: true",
      })).status,
    ).toBe(200);
    const saved = (await (await call("/api/admin/clash")).json()) as {
      override_yaml: string;
    };
    expect(saved.override_yaml).toContain("enable: true");
    expect(db.prepare("SELECT count(*) AS n FROM clash_settings").get()?.n).toBe(1);
    await seed();
    const me = (await (await call("/api/me")).json()) as {
      subscription_url: string;
    };
    expect(me.subscription_url).toMatch(/^https:\/\/zboard\.hasbai\.xyz\/sub\//);
    const yaml = await (
      await call(new URL(me.subscription_url).pathname + "?format=clash")
    ).text();
    const config = parse(yaml) as { dns: { enable: boolean }; proxies: unknown[] };
    expect(config.dns.enable).toBe(true);
    expect(config.proxies).toHaveLength(1);
  });
});
describe("subscription and template rendering", () => {
  it("escapes template values and preserves whole-placeholder types", () => {
    expect(
      JSON.parse(
        renderTemplate('{"port":"{{port}}","name":"x{{name}}"}', {
          port: 443,
          name: '"',
        }),
      ),
    ).toEqual({ port: 443, name: 'x"' });
    expect(() => renderTemplate('{"a":"{{missing}}"}', {})).toThrow();
  });
  it("rejects malformed counters and removes zeros", () => {
    expect(normalizeTrafficPayload({ "1": [0, 0] }).size).toBe(0);
    for (const v of [
      [],
      { "01": [0, 1] },
      { "1": [Number.MAX_SAFE_INTEGER + 1, 0] },
      { "1": [0, -1] },
    ])
      expect(() => normalizeTrafficPayload(v)).toThrow();
  });
  it("uses only public allowlisted client fields in each supported format", () => {
    const c = clientConfig({
      ...client,
      private_key: "secret",
      public_key: "pub",
    });
    expect(c).not.toHaveProperty("private_key");
    const nodes = [
      {
        id: 1,
        name: "测试",
        node_type: "vless",
        client_json: JSON.stringify(c),
      },
    ];
    expect(subscription(nodes, "uuid", "uri")).toContain(
      "vless://uuid@node.example.com:443",
    );
    const clash = parse(subscription(nodes, "uuid", "clash")) as {
      proxies: Array<{ name: string; uuid: string }>;
      "proxy-groups": Array<{ name: string; proxies: string[] }>;
    };
    expect(clash.proxies[0].uuid).toBe("uuid");
    expect(clash["proxy-groups"].find((g) => g.name === "本站节点")?.proxies)
      .toEqual([clash.proxies[0].name]);
    expect(atob(subscription(nodes, "uuid", "base64"))).toContain("vless://");
  });
  it("merges administrator overrides without replacing per-user site proxies", () => {
    const nodes = [{
      id: 7,
      name: "专属节点",
      node_type: "vless",
      client_json: JSON.stringify(client),
    }];
    const rendered = parse(subscription(nodes, "own-uuid", "clash", {
      template_yaml: `proxies: []\nproxy-groups:\n  - name: 策略\n    type: select\n    proxies: [本站节点, DIRECT]\nrules: ["MATCH,策略"]\ndns:\n  enable: false\n`,
      override_yaml: "dns:\n  enable: true\nrules: [\"MATCH,策略\"]\n",
    })) as Record<string, unknown>;
    expect(rendered.dns).toEqual({ enable: true });
    expect((rendered.proxies as Array<Record<string, unknown>>)[0].uuid).toBe("own-uuid");
    expect((rendered["proxy-groups"] as Array<Record<string, unknown>>).at(-1))
      .toMatchObject({ name: "本站节点", proxies: ["专属节点 · 7"] });
    expect(() => subscription(nodes, "own-uuid", "clash", {
      template_yaml: "proxies: []\nproxy-groups: []\nrules: []",
      override_yaml: "proxy-groups:\n  - name: 本站节点\n    type: select\n    proxies: [DIRECT]",
    })).toThrow();
  });
});
