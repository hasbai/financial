# Zboard

Svelte 5 SPA、共享 Luma UI（neutral）、共享 Auth0 PKCE 客户端、Cloudflare Worker 和 D1。用户首次登录自动创建禁用账户，管理员在用户页启用并分配节点；无自建密码、登录或会话服务。

- 管理页：总览、节点 CRUD、模板 CRUD / JSON 变量载入、用户启停 / 配额 / 到期 / 分配、最近报告。
- 用户页：本人用量、有效期、节点、通用 Base64 / URI / Clash(Mihomo) 订阅、链接轮换。订阅随机凭据仅向本人返回；过期、停用、额度用尽即时拒绝。
- Node API 保留 XrayR NewV2board `/api/v1/server/UniProxy/config|user|push`；节点 token 与 Auth0 无关。全零流量不写 D1，正流量通过单批次更新累计并存报告。不在 GET 轮询写心跳。

## 运行与发布

仓库根 `pnpm install`；`pnpm dev:zboard`。本地 API 另从此目录启动 `pnpm exec wrangler dev --port 8787`，Vite 开发代理 API。自动化检查只在 GitHub Actions。`Zboard` workflow 执行类型、SQL/接口单元测试、构建、D1 本地迁移及 WebKit/Chromium 视觉回归；候选通过根 `Check` 的 `update_visual_baselines` 显式生成。审阅后 `pnpm visual:baseline:import <artifact> --reviewed`，随后 PR 必须普通比较通过。

Cloudflare Workers Builds 使用 `hasbai/financial` / main，根目录 `/`，build `pnpm --filter zboard build`，deploy `pnpm --filter zboard exec wrangler deploy`。监控 `apps/zboard/**`、`packages/auth/**`、`packages/ui/**`、`pnpm-lock.yaml`。复用现有 Worker/D1；禁止创建重复部署流水线。Auth0 setup：从此目录执行 `node scripts/setup-auth0.mjs`，只扩展共享 SPA origins、注册独立 audience 和 audience 限定的 Action；保留其他应用的授权规则。

生产迁移只应用本目录迁移，不从独立源码仓库运行 seed。0002 保留迁移名但不写测试数据；0003 删除原公开 demo 用户并停用 demo 节点。用户已明确项目未上线、无旧业务数据；没有旧账号迁移功能。对已有 D1 的增列只用于演进原型资源，不导入旧数据。

## 业务与安全边界

Auth0 tenant `hasbai.eu.auth0.com`，audience `https://zboard.hasbai.xyz/api`，namespaced role 值 superadmin。Worker 用 jose/JWKS 验证签名、issuer、audience、有效期；普通用户只用 sub 查本人。email 只显示，不作为授权关联。第一次登录产生一条禁用用户记录，其后读取不重复写入。管理员不能在面板授予自身管理员角色。

节点服务端 JSON 和订阅公开参数分别存储，订阅序列化仅使用白名单；REALITY 私钥仅存在管理员配置，不出现在订阅。节点地址、端口、SNI、公钥等由管理员据真实节点填写；面板不生成虚假的可用节点。VMess/VLESS/Trojan/Shadowsocks 支持常规 TCP/WS/gRPC 参数，Shadowsocks 仅标准 AEAD TCP。Clash 格式是 YAML 兼容的 JSON。配额以字节存储，GB 输入换算 1024³；额度 0 为不限。到期编辑明确使用 UTC。设备上限仅按原节点协议提供字段，官方 NewV2board 可能使用本机 override。

模板是可复制的配置快照；编辑模板不自动修改节点。载入模板只修改当前编辑器，保存才写入。JSON 中完整的 `{{var}}` 字符串按变量原始 JSON 类型替换，嵌入字符串的变量会正确转义；未提供变量拒绝载入。JSON 有效不等于所有 XrayR 协议字段有效，节点运行配置仍需按实际部署填写。

同步按钮递增 revision，代表等待节点下次轮询；不表示节点已经应用。XrayR 官方 NewV2board 对空用户列表有既有局限，停用最后一个用户后节点端可能保留缓存，立即撤销全部代理服务须在节点端停服。未改变上游 XrayR。流量协议无幂等标识，响应不明确的重试可能重复累加；不承诺精确一次。报告页面最近100条，全零请求无报告，不伪造在线状态。D1 使用原五张表，未增加每日汇总或心跳写入；原始报告尚未自动清理。

自动测试 fixture 独立于生产入口，生产无认证绕过。UI 组件用真实生产 CSS 验收；模拟设备不代表 iOS 真机或实际代理链路验收。
