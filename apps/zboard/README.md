# Zboard

代理节点、用户资格和订阅管理，Svelte 5 SPA、共享 Luma UI / Auth0，Worker 与 D1。首次登录创建禁用账户，管理员启用并分配节点。

- 管理：总览、节点、JSON 模板/变量、用户启停/配额/到期/分配、最近报告。
- 用户：本人用量/有效期/节点，URI、Base64 与 Clash/Mihomo 订阅，凭据轮换。
- Node API：兼容 XrayR NewV2board 的 config/user/push，正流量累计和报告，全零不落库。

## 本地运行

仓库根 `pnpm install --frozen-lockfile`、`pnpm dev:zboard`。API 在此目录执行 `pnpm exec wrangler dev --port 8787`，前端通过 Vite 代理。

开发前读[Zboard 边界与路由](../../docs/zboard/README.md)，业务/资源/发布入口见[架构](../../docs/zboard/ARCHITECTURE.md)，本地检查与交付见[TESTING](../../docs/TESTING.md)。

## Clash/Mihomo 内置分流模板

完整订阅策略、规则来源/许可、DNS、覆盖项合并与旧默认兼容的唯一说明在[模板契约](../../docs/zboard/ARCHITECTURE.md#clashmihomo-内置分流模板)。URI/Base64 只提供节点列表；规则/节点实际可用性须另行验证。
