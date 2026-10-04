# Zboard

Svelte 5 SPA、共享 Luma UI（neutral）、共享 Auth0 PKCE 客户端、Cloudflare Worker 和 D1。用户首次登录自动创建禁用账户，管理员在用户页启用并分配节点；无自建密码、登录或会话服务。

- 管理页：总览、节点 CRUD、模板 CRUD / JSON 变量载入、用户启停 / 配额 / 到期 / 分配、最近报告。
- 用户页：本人用量、有效期、节点、通用 Base64 / URI / Clash(Mihomo) 订阅、链接轮换。订阅随机凭据仅向本人返回；过期、停用、额度用尽即时拒绝。订阅链接使用 `https://zboard.hasbai.xyz`，本地开发保留本地地址。
- 管理员在“配置模板 → Clash 订阅模板”编辑 YAML 基础模板和覆盖项。覆盖项的对象递归合并、数组整体替换；用户获分配的本站节点在合并后注入 `proxies` 和保留的“本站节点”代理组。节点客户端参数仍由节点页维护，服务端私钥不进入订阅。默认模板参考 [Xboard 的 Clash Meta 模板处理](https://github.com/cedar2025/Xboard/blob/4f48e61a2cbc6db5338872b6bdb45ef954ec1256/app/Protocols/ClashMeta.php#L144-L233) 的动态节点思路。
- Node API 保留 XrayR NewV2board `/api/v1/server/UniProxy/config|user|push`；节点 token 与 Auth0 无关。全零流量不写 D1，正流量通过单批次更新累计并存报告。不在 GET 轮询写心跳。

## 运行与发布

仓库根 `pnpm install`；`pnpm dev:zboard`。本地 API 另从此目录启动 `pnpm exec wrangler dev --port 8787`，Vite 开发代理 API。自动化验收只在 GitHub Actions。`Zboard` workflow 执行类型、SQL/接口单元测试、Mihomo 原生配置校验、构建、D1 本地迁移及 WebKit/Chromium 视觉回归。本地截图使用根 `pnpm visual:zboard --page src/pages/Templates.svelte` 的固定 Linux 镜像生成，审阅后 `pnpm visual:baseline:import-local <运行目录> --reviewed`；随后 PR 必须普通比较通过，详见 [TESTING](../../docs/TESTING.md)。

Cloudflare Workers Builds 使用 `hasbai/financial` / main，根目录 `/`，build `pnpm --filter zboard build`，deploy `pnpm --filter zboard exec wrangler deploy`。自定义域名为 `zboard.hasbai.xyz`。监控 `apps/zboard/**`、`packages/auth/**`、`packages/ui/**`、`pnpm-lock.yaml`。复用现有 Worker/D1；禁止创建重复部署流水线。Auth0 setup：从此目录执行 `node scripts/setup-auth0.mjs`，只扩展共享 SPA origins、注册独立 audience 和 audience 限定的 Action；保留其他应用的授权规则。

生产迁移只应用本目录迁移，不从独立源码仓库运行 seed。0002 保留迁移名但不写测试数据；0003 删除原公开 demo 用户并停用 demo 节点。用户已明确项目未上线、无旧业务数据；没有旧账号迁移功能。对已有 D1 的增列只用于演进原型资源，不导入旧数据。

## 业务与安全边界

### Clash/Mihomo 内置分流模板

`format=clash` 返回完整的 Mihomo YAML。默认包含节点选择、自动测速、故障转移、广告拦截、国内直连、AI、YouTube、Netflix、Disney+、Spotify、哔哩哔哩、Telegram、社交平台、GitHub、Google、微软、苹果、游戏和兜底策略组。国内游戏/CDN、苹果和微软中国域名优先直连；国内服务分类先于海外大类，海外代理域名先于中国 IP，最终未匹配流量交给“漏网之鱼”。广告默认 REJECT，可在客户端切换 DIRECT。微软、苹果、哔哩哔哩默认 DIRECT，其余海外服务默认走节点选择。

规则数据来自 [MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat) 的 `meta/geo/geosite` 域名 YAML 与 `meta/geo/geoip` IP YAML，客户端按 `rule-providers` 每 86400 秒更新和本地缓存；不在 Worker 请求中下载、不把上游规则全文复制入仓库。上游数据许可为 [GPL-3.0](https://github.com/MetaCubeX/meta-rules-dat/blob/master/LICENSE)，其 README 记录各数据源。模板结构参考 [Xboard 默认配置](https://github.com/cedar2025/Xboard/blob/master/resources/rules/default.clash.yaml) 的动态节点、测速与故障转移做法；本站策略及规则编排单独实现。规则匹配和下载字段遵循 [Mihomo rule-providers](https://wiki.metacubex.one/en/config/rule-providers/) 与 [DNS](https://wiki.metacubex.one/en/config/dns/) 文档。

规则下载明确走“节点选择”；节点域名用国内 DoH 独立解析，DNS 服务域名有 IP bootstrap；海外域名使用经代理的 DoH，国内规则走国内 DoH。启动不依赖 GeoIP/GeoSite 数据库，不自动开启 TUN 或占用本地 53 端口。首次导入仍需要本站真实节点可连通并允许访问公共规则源，之后有本地缓存；不承诺节点或外部服务可用性。

仅适用于支持上述字段的 Clash Meta/Mihomo 客户端，本次 CI 以固定 Mihomo `v1.19.32` 和 SHA-256 校验的二进制验收。CI 下载全部实际 YAML 规则，检查 payload，并逐项执行原生 `convert-ruleset` 校验 domain/ipcidr 内容；另以本地文件 provider 调用原生 `-t` 验证完整配置语法与各节点类型兼容。这不证明真实节点连接、规则通过代理下载或特定客户端版本的实际导入。URI/Base64 继续仅提供节点列表。

“载入内置分流模板”只替换当前 YAML 编辑内容，保留覆盖项，保存才写 D1。已保存的旧默认仅在文本与旧版完全一致（忽略首尾空白）且覆盖项为空时于读取/生成阶段使用新模板；不改写数据库，自定义 YAML 和带覆盖项的旧模板保留。`{{本站节点}}` 可用于策略组的 `proxies` 数组，合并覆盖项后展开为当前订阅用户的节点名，自动测速和故障转移仅测试这些节点；“本站节点”组仍在最后由系统生成。无分配/有效节点时订阅返回 404。

### 认证、节点与配置边界

Auth0 tenant `hasbai.eu.auth0.com`，统一登录域名/issuer `auth.hasbai.xyz`（共享 `packages/auth`），audience `https://zboard.hasbai.xyz/api`，顶层 `_roles` 角色数组包含 superadmin 才授予管理员；`email` 使用同名顶层字段。Worker 用 jose/JWKS 验证签名、issuer、audience、有效期；普通用户只用 sub 查本人。email 只显示，不作为授权关联。第一次登录产生一条禁用用户记录，其后读取不重复写入。管理员不能在面板授予自身管理员角色。

节点服务端 JSON 和订阅公开参数分别存储，订阅序列化仅使用白名单；REALITY 私钥仅存在管理员配置，不出现在订阅。节点地址、端口、SNI、公钥等由管理员据真实节点填写；面板不生成虚假的可用节点。VMess/VLESS/Trojan/Shadowsocks 支持常规 TCP/WS/gRPC 参数，Shadowsocks 仅标准 AEAD TCP。Clash 格式为 YAML；模板与覆盖项存于独立 `clash_settings` 表，与节点协议 JSON 模板分开。配额以字节存储，GB 输入换算 1024³；额度 0 为不限。到期编辑明确使用 UTC。设备上限仅按原节点协议提供字段，官方 NewV2board 可能使用本机 override。

模板是可复制的配置快照；编辑模板不自动修改节点。载入模板只修改当前编辑器，保存才写入。JSON 中完整的 `{{var}}` 字符串按变量原始 JSON 类型替换，嵌入字符串的变量会正确转义；未提供变量拒绝载入。JSON 有效不等于所有 XrayR 协议字段有效，节点运行配置仍需按实际部署填写。

同步按钮递增 revision，代表等待节点下次轮询；不表示节点已经应用。XrayR 官方 NewV2board 对空用户列表有既有局限，停用最后一个用户后节点端可能保留缓存，立即撤销全部代理服务须在节点端停服。未改变上游 XrayR。流量协议无幂等标识，响应不明确的重试可能重复累加；不承诺精确一次。报告页面最近100条，全零请求无报告，不伪造在线状态。D1 使用原五张表，未增加每日汇总或心跳写入；原始报告尚未自动清理。

自动测试 fixture 独立于生产入口，生产无认证绕过。UI 组件用真实生产 CSS 验收；模拟设备不代表 iOS 真机或实际代理链路验收。
