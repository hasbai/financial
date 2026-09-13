# Financial 项目指南

个人财务管理，React SPA / TypeScript / Material UI / pnpm。Cloudflare Worker `financial`，域名 `financial.hasbai.xyz`；Neon hasbai / neondb / financial；Auth0 北极小站。

## 用户确认的边界

- 单人使用，只允许本人 Auth0 subject，历史数据全部人民币。
- 仅使用现有 `financial.account`、`financial.transaction`、`financial.entry` 三张表，禁止新增表字段（包括 is_active、is_cash_equivalent、version、退款关联字段等）。
- 现金范围直接用资产下的“现金及等价物”子类。退款补在同一 transaction 内。视图不用 v_ 前缀。
- 所有业务视图、函数、类型均在 `financial`。不新增业务 schema，不加 ledger、member、draft、audit 或其他扩展表。
- 不为多用户、家庭共享、审计平台或草稿工作流做预设计。修改围绕总览、流水补录、科目匹配。
- 原有记录和 ID 必须保留。迁移先在隔离 Neon 分支验证，不能用开发分支数据覆盖生产。
- 浏览器只含公开配置和本人 Access Token；不保存数据库连接串、Auth0 密码/client secret、管理 API key。
- 数据库授权保留：Auth0 JWT 的 subject/issuer/audience 必须匹配；读视图 security_invoker，写函数固定 search_path，客户端无基表 DML。
- 金额使用 numeric 和十进制字符串。借贷、退款、报表计算放 SQL，前端仅做输入反馈。

## 文档与代码路由

| 工作 | 入口 |
| --- | --- |
| 当前完成情况 | docs/PROGRESS.md |
| 范围与执行步骤 | docs/PLAN.md |
| UI 与交互 | DESIGN.md、src/pages |
| 数据与口径 | docs/DATABASE.md、docs/DOMAIN.md、database/migrations |
| 接入与发布 | docs/ARCHITECTURE.md |
| 历史基线快照 | docs/BASELINE.md |

## 校验与提交

`pnpm typecheck`、`pnpm test`、`pnpm build`、`git diff --check`。
数据库验证用 `scripts/test-database.mjs`，连接串从 stdin 传入，所有测试写入在事务中回滚。不得输出凭据。

独立区分自动化、真实 JWT/API、浏览器与部署验收。完成本次修改后仅暂存任务文件，提交、推送并核验远端。发布按当前用户授权执行。
