import { it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { parse, stringify } from "yaml";
import { subscription } from "./subscription";

// CI installs a checksum-pinned Mihomo. This is not a live proxy connectivity test.
it.skipIf(!process.env.MIHOMO_BIN)("validates public rule payloads and a complete subscription with Mihomo", async () => {
  const home = await mkdtemp(join(tmpdir(), "zboard-mihomo-"));
  try {
    const output = subscription(["vless", "vmess", "trojan", "shadowsocks"].map((node_type, i) => ({
      id: i + 1,
      name: "兼容验证",
      node_type,
      client_json: JSON.stringify({ server: "192.0.2.1", port: 443, security: "tls", network: "tcp" }),
    })), "00000000-0000-4000-8000-000000000001", "clash");
    const config = parse(output) as {
      "rule-providers": Record<string, { type: string; url?: string; proxy?: string; path: string; behavior: string }>;
    };
    const providers = Object.values(config["rule-providers"]);
    // Download independently of fictional nodes. convert-ruleset parses payloads;
    // file providers keep the separate config check independent of live proxies.
    for (let offset = 0; offset < providers.length; offset += 6) {
      await Promise.all(providers.slice(offset, offset + 6).map(async (provider) => {
        const response = await fetch(provider.url!, { signal: AbortSignal.timeout(30_000) });
        expect(response.ok, provider.url).toBe(true);
        const yaml = await response.text();
        const rules = parse(yaml) as { payload: unknown[] };
        expect(Array.isArray(rules.payload), provider.url).toBe(true);
        expect(rules.payload.length, provider.url).toBeGreaterThan(0);
        expect(rules.payload.every((value) => typeof value === "string"), provider.url).toBe(true);
        const path = join(home, provider.path);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, yaml);
        const conversion = spawnSync(process.env.MIHOMO_BIN!, ["convert-ruleset", provider.behavior, "yaml", path, path + ".mrs"], {
          encoding: "utf8", timeout: 30_000,
        });
        expect(conversion.error, provider.url).toBeUndefined();
        expect(conversion.status, provider.url).toBe(0);
        expect(conversion.stdout + conversion.stderr, provider.url).not.toMatch(/invalid|error|warn/i);
        provider.type = "file";
        delete provider.url;
        delete provider.proxy;
      }));
    }
    const path = join(home, "config.yaml");
    await writeFile(path, stringify(config));
    const result = execFileSync(process.env.MIHOMO_BIN!, ["-t", "-d", home, "-f", path], {
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(result).toContain("test is successful");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}, 180_000);
