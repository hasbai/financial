// Rule data remains upstream; the client downloads and refreshes these public sets.
// Sources and routing policy: ../README.md#clashmihomo-内置分流模板
export const SITE_GROUP = "本站节点";
export const SITE_NODES = "{{本站节点}}";

const services = [
  ["ai", "category-ai-!cn", "AI 服务"],
  ["youtube", "youtube", "YouTube"],
  ["netflix", "netflix", "Netflix"],
  ["disney", "disney", "Disney+"],
  ["spotify", "spotify", "Spotify"],
  ["bilibili", "bilibili", "哔哩哔哩"],
  ["telegram", "telegram", "Telegram"],
  ["twitter", "twitter", "社交平台"],
  ["facebook", "facebook", "社交平台"],
  ["instagram", "instagram", "社交平台"],
  ["discord", "discord", "社交平台"],
  ["github", "github", "GitHub"],
  ["google", "google", "Google"],
  ["microsoft", "microsoft", "微软服务"],
  ["apple", "apple", "苹果服务"],
  ["games", "category-games-!cn", "游戏平台"],
] as const;

const domains: ReadonlyArray<readonly [string, string]> = [
  ["private", "private"],
  ["ads", "category-ads-all"],
  ["apple-cn", "apple-cn"],
  ["microsoft-cn", "microsoft@cn"],
  ["games-cn", "category-games@cn"],
  ["steam-cn", "steam@cn"],
  ...services.map(([key, source]) => [key, source] as const),
  ["proxy", "geolocation-!cn"],
  ["cn", "cn"],
];
const ips: ReadonlyArray<readonly [string, string]> = [
  ["private-ip", "private"],
  ["telegram-ip", "telegram"],
  ["cn-ip", "cn"],
];

function provider(key: string, source: string, ip = false): string {
  return `  ${key}:
    type: http
    behavior: ${ip ? "ipcidr" : "domain"}
    format: yaml
    interval: 86400
    proxy: 节点选择
    path: ./ruleset/${key}.yaml
    url: https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/${ip ? "geoip" : "geosite"}/${source}.yaml
`;
}

const serviceGroups = [...new Set(services.map(([, , group]) => group))];
export const DEFAULT_CLASH_TEMPLATE = `mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
ipv6: false
profile:
  store-selected: true
  store-fake-ip: true
dns:
  enable: true
  ipv6: false
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  fake-ip-filter:
    - '*.lan'
    - '*.local'
    - localhost.ptlogin2.qq.com
    - '+.msftconnecttest.com'
    - '+.msftncsi.com'
  default-nameserver: [223.5.5.5, 119.29.29.29]
  proxy-server-nameserver:
    - https://dns.alidns.com/dns-query
    - https://doh.pub/dns-query
  direct-nameserver:
    - https://dns.alidns.com/dns-query
    - https://doh.pub/dns-query
  nameserver:
    - 'https://1.1.1.1/dns-query#节点选择'
    - 'https://8.8.8.8/dns-query#节点选择'
  nameserver-policy:
    'rule-set:private,cn,apple-cn,microsoft-cn,games-cn,steam-cn':
      - https://dns.alidns.com/dns-query
      - https://doh.pub/dns-query
proxies: []
proxy-groups:
  - name: 节点选择
    type: select
    proxies: [自动选择, 故障转移, 本站节点, DIRECT]
  - name: 自动选择
    type: url-test
    proxies: ['${SITE_NODES}']
    url: https://www.gstatic.com/generate_204
    interval: 300
    tolerance: 50
  - name: 故障转移
    type: fallback
    proxies: ['${SITE_NODES}']
    url: https://www.gstatic.com/generate_204
    interval: 300
${serviceGroups.map((name) => `  - name: ${name}
    type: select
    proxies: [${["哔哩哔哩", "微软服务", "苹果服务"].includes(name) ? "DIRECT, 节点选择" : "节点选择, DIRECT"}, 本站节点]
`).join("")}  - name: 国内直连
    type: select
    proxies: [DIRECT, 节点选择]
  - name: 广告拦截
    type: select
    proxies: [REJECT, DIRECT]
  - name: 漏网之鱼
    type: select
    proxies: [节点选择, DIRECT, 本站节点]
rule-providers:
${domains.map(([key, source]) => provider(key, source)).join("")}${ips.map(([key, source]) => provider(key, source, true)).join("")}rules:
  - RULE-SET,private,DIRECT
  - RULE-SET,private-ip,DIRECT,no-resolve
  - RULE-SET,ads,广告拦截
  - RULE-SET,apple-cn,国内直连
  - RULE-SET,microsoft-cn,国内直连
  - RULE-SET,games-cn,国内直连
  - RULE-SET,steam-cn,国内直连
${services.map(([key, , group]) => `  - RULE-SET,${key},${group}\n`).join("")}  - RULE-SET,telegram-ip,Telegram,no-resolve
  - RULE-SET,proxy,节点选择
  - RULE-SET,cn,国内直连
  - RULE-SET,cn-ip,国内直连,no-resolve
  - MATCH,漏网之鱼
`;

// Exact legacy-default recognition never rewrites an administrator's custom YAML.
export const LEGACY_CLASH_TEMPLATE = `mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
ipv6: false
proxies: []
proxy-groups:
  - name: 节点选择
    type: select
    proxies:
      - 本站节点
      - DIRECT
rules:
  - GEOIP,CN,DIRECT
  - MATCH,节点选择
`;
