/** Explicit allowlist: server configuration (especially private keys) never enters subscriptions. */
import {
  DEFAULT_CLASH_TEMPLATE,
  renderClashTemplate,
  type ClashSettings,
} from "./clash-template";
export type ClientConfig = {
  server: string;
  port: number;
  security: "none" | "tls" | "reality";
  sni: string;
  public_key: string;
  short_id: string;
  fingerprint: string;
  network: "tcp" | "ws" | "grpc";
  path: string;
  host: string;
  service_name: string;
  flow: string;
  cipher: string;
};
export type SubscriptionNode = {
  id: number;
  name: string;
  node_type: string;
  client_json: string;
};
export function clientConfig(value: unknown, required = false): ClientConfig {
  const v =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const text = (key: string, fallback = "") =>
    typeof v[key] === "string" ? String(v[key]).trim() : fallback;
  const server = text("server");
  const port = Number(v.port ?? 443);
  const security = text("security", "tls");
  const network = text("network", "tcp");
  if (
    (required && !server) ||
    /[\s/@?#]/.test(server) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw new Error("请输入有效的服务器地址和端口");
  if (
    !["none", "tls", "reality"].includes(security) ||
    !["tcp", "ws", "grpc"].includes(network)
  )
    throw new Error("无效的安全或传输协议");
  if (security === "reality" && required && !text("public_key"))
    throw new Error("REALITY 公钥不能为空");
  return {
    server,
    port,
    security: security as ClientConfig["security"],
    network: network as ClientConfig["network"],
    sni: text("sni"),
    public_key: text("public_key"),
    short_id: text("short_id"),
    fingerprint: text("fingerprint", "chrome"),
    path: text("path", "/"),
    host: text("host"),
    service_name: text("service_name"),
    flow: text("flow"),
    cipher: text("cipher", "aes-128-gcm"),
  };
}
function base64(value: string) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(value)));
}
export function nodeUri(node: SubscriptionNode, uuid: string): string {
  const c = clientConfig(JSON.parse(node.client_json), true);
  const type = node.node_type.toLowerCase();
  const address =
    c.server.includes(":") && !c.server.startsWith("[")
      ? `[${c.server}]`
      : c.server;
  const label = encodeURIComponent(node.name);
  if (type === "vmess")
    return (
      "vmess://" +
      base64(
        JSON.stringify({
          v: "2",
          ps: node.name,
          add: c.server,
          port: String(c.port),
          id: uuid,
          aid: "0",
          scy: "auto",
          net: c.network,
          type: "none",
          host: c.host,
          path: c.network === "grpc" ? c.service_name : c.path,
          tls: c.security === "none" ? "" : "tls",
          sni: c.sni,
        }),
      )
    );
  if (type === "shadowsocks")
    return `ss://${base64(`${c.cipher}:${uuid}`)}@${address}:${c.port}#${label}`;
  if (!["vless", "trojan"].includes(type)) throw new Error("不支持的订阅协议");
  const p = new URLSearchParams({ security: c.security, type: c.network });
  if (type === "vless") p.set("encryption", "none");
  for (const [key, value] of Object.entries({
    sni: c.sni,
    fp: c.fingerprint,
    pbk: c.public_key,
    sid: c.short_id,
    flow: c.flow,
    host: c.host,
    path: c.network === "ws" ? c.path : "",
    serviceName: c.network === "grpc" ? c.service_name : "",
  }))
    if (value) p.set(key, value);
  return `${type}://${encodeURIComponent(uuid)}@${address}:${c.port}?${p}#${label}`;
}
export function subscription(
  nodes: SubscriptionNode[],
  uuid: string,
  format: string,
  settings: ClashSettings = {
    template_yaml: DEFAULT_CLASH_TEMPLATE,
    override_yaml: "",
  },
): string {
  if (format === "base64")
    return base64(nodes.map((n) => nodeUri(n, uuid)).join("\n"));
  if (format === "uri") return nodes.map((n) => nodeUri(n, uuid)).join("\n");
  if (format !== "clash") throw new Error("不支持的订阅格式");
  const proxies = nodes.map((n) => {
    const c = clientConfig(JSON.parse(n.client_json), true);
    const type = n.node_type === "shadowsocks" ? "ss" : n.node_type;
    const p: Record<string, unknown> = {
      name: `${n.name} · ${n.id}`,
      type,
      server: c.server,
      port: c.port,
      udp: true,
    };
    if (type === "ss") {
      p.cipher = c.cipher;
      p.password = uuid;
    } else if (type === "trojan") p.password = uuid;
    else p.uuid = uuid;
    if (type === "vmess") {
      p.alterId = 0;
      p.cipher = "auto";
    }
    if (type !== "ss") {
      p.tls = c.security !== "none";
      p.servername = c.sni || c.server;
      p["client-fingerprint"] = c.fingerprint;
      p.network = c.network;
      if (c.flow) p.flow = c.flow;
      if (c.security === "reality")
        p["reality-opts"] = {
          "public-key": c.public_key,
          "short-id": c.short_id,
        };
      if (c.network === "ws")
        p["ws-opts"] = {
          path: c.path,
          headers: c.host ? { Host: c.host } : {},
        };
      if (c.network === "grpc")
        p["grpc-opts"] = { "grpc-service-name": c.service_name };
    }
    return p;
  });
  return renderClashTemplate(settings, proxies);
}
