import { parseDocument, stringify } from "yaml";
import {
  DEFAULT_CLASH_TEMPLATE,
  LEGACY_CLASH_TEMPLATE,
  SITE_GROUP,
  SITE_NODES,
} from "../shared/clash-preset";
export { DEFAULT_CLASH_TEMPLATE, SITE_GROUP } from "../shared/clash-preset";

export type ClashSettings = {
  template_yaml: string;
  override_yaml: string;
};

export function resolveClashSettings(settings: ClashSettings): ClashSettings {
  return settings.template_yaml.trim() === LEGACY_CLASH_TEMPLATE.trim() &&
    !settings.override_yaml.trim()
    ? { ...settings, template_yaml: DEFAULT_CLASH_TEMPLATE }
    : settings;
}

type Mapping = Record<string, unknown>;

function isMapping(value: unknown): value is Mapping {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertSafe(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertSafe);
  } else if (isMapping(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key))
        throw new Error("YAML 包含不允许的键");
      assertSafe(item);
    }
  } else if (
    value !== null &&
    !["string", "number", "boolean"].includes(typeof value)
  ) {
    throw new Error("YAML 包含不支持的值");
  } else if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("YAML 数值必须有限");
  }
}

function parseMapping(source: string, label: string): Mapping {
  if (source.length > 128_000) throw new Error(`${label}不能超过 128 KB`);
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length)
    throw new Error(`${label}无效：${document.errors[0]?.message}`);
  const value: unknown = document.toJS({ maxAliasCount: 0 });
  if (!isMapping(value)) throw new Error(`${label}必须是 YAML 对象`);
  assertSafe(value);
  return value;
}

function merge(base: Mapping, override: Mapping): Mapping {
  const result: Mapping = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] =
      isMapping(value) && isMapping(result[key])
        ? merge(result[key], value)
        : value;
  }
  return result;
}

export function renderClashTemplate(
  settings: ClashSettings,
  siteProxies: Mapping[],
): string {
  const template = parseMapping(
    resolveClashSettings(settings).template_yaml,
    "Clash 模板",
  );
  const override = settings.override_yaml.trim()
    ? parseMapping(settings.override_yaml, "管理员覆盖项")
    : {};
  const config = merge(template, override);
  if (
    !Array.isArray(config.proxies) ||
    !Array.isArray(config["proxy-groups"]) ||
    !Array.isArray(config.rules)
  )
    throw new Error("Clash 配置须包含 proxies、proxy-groups 和 rules 数组");
  if (!config.rules.every((rule) => typeof rule === "string" && rule.trim()))
    throw new Error("rules 须为非空规则字符串数组");

  const names = new Set<string>();
  for (const proxy of config.proxies) {
    if (
      !isMapping(proxy) ||
      typeof proxy.name !== "string" ||
      !proxy.name ||
      typeof proxy.type !== "string" ||
      !proxy.type
    )
      throw new Error("模板代理须包含名称和类型");
    if (proxy.name === SITE_GROUP || names.has(proxy.name))
      throw new Error(`代理名称冲突：${proxy.name}`);
    names.add(proxy.name);
  }
  for (const group of config["proxy-groups"]) {
    if (
      !isMapping(group) ||
      typeof group.name !== "string" ||
      !group.name ||
      typeof group.type !== "string" ||
      !group.type ||
      !Array.isArray(group.proxies)
    )
      throw new Error("代理组须包含名称、类型和 proxies 数组");
    if (!group.proxies.every((proxy) => typeof proxy === "string" && proxy.trim()))
      throw new Error("代理组 proxies 须为名称字符串数组");
    if (group.name === SITE_GROUP || names.has(group.name))
      throw new Error(`代理组名称冲突：${group.name}`);
    names.add(group.name);
  }
  for (const proxy of siteProxies) {
    if (typeof proxy.name !== "string" || names.has(proxy.name))
      throw new Error(`节点名称冲突：${String(proxy.name)}`);
    names.add(proxy.name);
  }

  config.proxies = [...config.proxies, ...siteProxies];
  const siteNames = siteProxies.length
    ? siteProxies.map((proxy) => String(proxy.name))
    : ["DIRECT"];
  config["proxy-groups"] = [
    ...config["proxy-groups"].map((group) => {
      const g = group as Mapping;
      return {
        ...g,
        proxies: (g.proxies as string[]).flatMap((name) =>
          name === SITE_NODES ? siteNames : [name],
        ),
      };
    }),
    {
      name: SITE_GROUP,
      type: "select",
      proxies: siteNames,
    },
  ];
  const targets = new Set([
    ...names, SITE_GROUP, "DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE", "GLOBAL", "DNS",
  ]);
  const groups = new Map((config["proxy-groups"] as Mapping[]).map((g) => [String(g.name), g.proxies as string[]]));
  const complete = new Set<string>();
  const visiting = new Set<string>();
  function visit(name: string) {
    if (visiting.has(name)) throw new Error(`代理组循环引用：${name}`);
    if (complete.has(name)) return;
    visiting.add(name);
    for (const target of groups.get(name) ?? []) {
      if (!targets.has(target)) throw new Error(`代理组引用不存在：${target}`);
      if (groups.has(target)) visit(target);
    }
    visiting.delete(name);
    complete.add(name);
  }
  for (const name of groups.keys()) visit(name);
  // Validate preset-compatible rules without trying to reimplement Mihomo's
  // nested logical/sub-rule grammar for administrator-supplied advanced rules.
  for (const rule of config.rules as string[]) {
    const [type, provider, target] = rule.split(",").map((part) => part.trim());
    if (type === "RULE-SET") {
      if (!isMapping(config["rule-providers"]) || !Object.hasOwn(config["rule-providers"], provider!))
        throw new Error(`规则集不存在：${provider}`);
      if (!targets.has(target!)) throw new Error(`规则引用不存在：${target}`);
    } else if (type === "MATCH" && !targets.has(provider!)) {
      throw new Error(`规则引用不存在：${provider}`);
    }
  }
  return stringify(config, { lineWidth: 0 });
}
