# Hasbai monorepo

- `apps/financial`：个人财务，Svelte 5 SPA，保留原有配色和三表边界。
- `apps/blog`：北极小站，SvelteKit SSR，Neutral / Luma / 衬线正文，在线 Markdown 编辑发布。
- `apps/zboard`：代理节点、用户管理与订阅配置，入口见 [Zboard](apps/zboard/README.md)。
- `apps/tavern`：酒馆，标准角色卡、世界书、在线搜索安装与持久角色对话，统一 `dynamic/rp`。
- `packages/ui`、`packages/auth`、`packages/data`：共享组件、认证和 PostgREST。

仓库沿用 `financial` 名称，包含上述四个独立应用。`pnpm dev` 启动财务，`pnpm dev:blog`、`pnpm dev:zboard`、`pnpm dev:tavern` 启动对应应用。完整校验在各应用的 GitHub Actions 中执行；共享依赖变动按受影响应用执行，具体见测试规范。

设计与接入见 [酒馆方案与路线图](docs/TAVERN.md)、[博客架构](docs/BLOG.md)、[财务架构](docs/ARCHITECTURE.md)、[测试规范](docs/TESTING.md)。

# 北极账本 · Financial

单人个人财务系统：Svelte 5 SPA、Bits UI、shadcn-svelte（preset `b6sUj31yy`）、Tailwind CSS 4、Lucide、pnpm。Auth0 北极小站登录，浏览器直连 Neon Data API，Cloudflare Worker `financial` 托管。

目标地址：[financial.hasbai.xyz](https://financial.hasbai.xyz) · 公开仓库：[hasbai/financial](https://github.com/hasbai/financial)

## 功能

- 总览：资产负债、现金流、损益、收支趋势及待补录数量。
- 流水：手机卡片、搜索筛选、分页、新增、补录、科目匹配与分录拆分。
- 退款：在同一个 transaction 内追加反向分录，报表按净额计算。
- 科目：编辑现有字段；“资产 / 现金及等价物”自动识别现金范围。

数据库保持原始 `account`、`transaction`、`entry` 三张表及原字段，没有新增业务表或表字段；视图、函数均在 `financial`，视图不用 `v_` 前缀。

## 本地运行

```sh
pnpm install --frozen-lockfile
pnpm dev
```

完整自动化验收在 GitHub CI 运行；本地可生成固定 Linux 视觉截图并审阅。页面与 API 契约改动由主代理修改提交、子代理推送并跟踪 PR，各项必需检查成功后 squash 合并；独立纯文档改动按规定验证后可快进直推。视觉基线、必需状态与交付流程见 [测试规范](docs/TESTING.md)。

财务前端公开配置在 `apps/financial/src/lib/config.ts`。本地 `.env` 仅存程序化验证所需的邮箱/密码，被 Git 忽略，不使用 `VITE_` 前缀，不进入前端构建。

真实JWT/API的专项核验方式见[接入与发布](docs/ARCHITECTURE.md)，不属于CI合成数据浏览器测试，也不向GitHub上传本地凭据。

## 文档

- [完成情况](docs/PROGRESS.md)
- [实施范围](docs/PLAN.md)
- [界面与交互](DESIGN.md)
- [业务口径](docs/DOMAIN.md)
- [数据库与 API](docs/DATABASE.md)
- [接入与发布](docs/ARCHITECTURE.md)
- [原始数据基线](docs/BASELINE.md)
