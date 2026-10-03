# Tavern · 酒馆

私人角色扮演对话：标准角色卡/世界书、在线搜卡安装、持久会话、流式生成、停止、重新生成与编辑分支。所有模型请求固定 Cloudflare AI Gateway `default` 的 `dynamic/rp`。

完整边界、API、来源、路线图与验收见 [方案](../../docs/TAVERN.md)。独立 Worker/D1/R2，Auth0复用北极小站共享配置与JWT claims；不修改财务数据。

本地模型的Agent、状态/记忆/工具与缓存优化，按[七步长期方案](../../docs/TAVERN-AGENT-PLAN.md)递进实施。

`pnpm dev:tavern`、`pnpm visual:tavern --all`。完整验收由 Tavern PR workflow 执行。生产自动发布用 Workers Builds，真实配置和验证记录在 [交付状态](../../docs/TAVERN-PROGRESS.md)。
