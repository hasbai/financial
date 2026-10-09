# Hasbai · 北极小站

个人使用的应用 monorepo，共享 Svelte 5、Luma UI 和北极小站登录。GitHub 仓库为 `hasbai/hasbai`，曾使用 `hasbai/financial` 名称。

| 应用 | 用途 | 代码与文档 |
| --- | --- | --- |
| 北极账本 | 资产负债、现金流、损益，流水补录、同笔退款与科目管理 | [Financial](docs/financial/README.md) · `apps/financial` |
| 北极小站 | 公开文章、手记、时间线、独立页面，在线 Markdown 编辑发布 | [Blog](docs/blog/README.md) · `apps/blog` |
| Zboard | 代理节点、用户资格、配置模板与订阅管理 | [Zboard](apps/zboard/README.md) · `apps/zboard` |
| 酒馆 | 角色卡与世界书、在线搜卡、持久对话、停止、续写与编辑分支 | [Tavern](apps/tavern/README.md) · `apps/tavern` |

## 本地运行

在仓库根执行：

```sh
pnpm install --frozen-lockfile
pnpm dev          # 财务，5173
pnpm dev:blog     # 博客，5174
pnpm dev:zboard   # Zboard，5175
pnpm dev:tavern   # 酒馆，5176
```

Zboard/Tavern 的本地 Worker API 启动方式见各应用文档。根 `pnpm build`、`pnpm typecheck`、`pnpm test` 默认代理财务；其他应用用 `pnpm --filter <应用名> <脚本>`。

开发前从 [AGENTS](AGENTS.md) 选择应用；查设计、数据与验收规则从[文档导航](docs/README.md)进入。四个应用均由 Cloudflare Workers Builds 自动发布，GitHub Actions 负责 PR 验收；本地检查和交付流程以[测试规范](docs/TESTING.md)为准。
