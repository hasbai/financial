# Financial · 北极账本开发入口

`apps/financial` 是单人个人财务系统，Svelte 5 SPA，由 Worker `financial` 在 `financial.hasbai.xyz` 托管。所有源码、原脚本和视觉清单相对路径以该目录为工作目录。

## 用户确认的业务边界

- 单人、人民币；业务访问由 Auth0 superadmin 角色及数据库授权管理，当前应用 permission 门禁见[共享授权规则](../AUTHORIZATION.md)。
- 只使用现有 `financial.account`、`financial.transaction`、`financial.entry` 三表及原字段；禁止新增表字段，包括 is_active、is_cash_equivalent、version、退款关联字段。所有业务视图、函数、类型均在 `financial`，不新增业务 schema，不加 ledger/member/draft/audit 等扩展表。
- 不为多用户、家庭共享、审计平台或草稿工作流预设计；围绕总览、流水补录和科目匹配实现。
- 现金范围直接使用资产下“现金及等价物”子类；退款追加同一 transaction。视图不使用 `v_` 前缀，不为前端形状增加 home、`*_read`、`*_daily` 包装视图或读取 RPC。
- 迁移保留原记录和 ID，不批量猜测合并或改历史状态。用户已授权通过界面修改科目 ID、删除单笔交易及其分录、删除无引用科目；迁移本身不得改写既有数据。
- Data API 验证 JWT，PostgreSQL 用 schema/对象 GRANT 授权。读视图 `security_invoker`，写函数固定 `search_path`；客户端无基表 DML。不增加应用层或 SQL 的 subject/issuer/audience 重复检查、is_owner 或 read_* 权限封装。
- 数据库金额使用 numeric、接口返回十进制字符串；前端 Decimal 做合计、分组、日期及页面格式转换，保留既有报表定义和保存校验。

## 按任务读取

| 任务 | 文档 | 代码入口（相对应用目录） |
| --- | --- | --- |
| 运行、接入、缓存与 PWA | [ARCHITECTURE](ARCHITECTURE.md) | `src/lib/config.ts`、`src/lib/reports.ts`、`src/lib/pwa*`、`scripts/build-pwa.mjs` |
| 页面、文案与参考 UI | [DESIGN](DESIGN.md)（修改页面必读） | `src/pages`、`src/components` |
| 表、视图、写入、迁移 | [DATABASE](DATABASE.md) | `../../database/migrations`、`src/lib/api.ts` |
| 金额、日期、退款与报表口径 | [DOMAIN](DOMAIN.md) | `src/lib/finance.ts`、`src/lib/cashflow.ts` |
| 分层测试与浏览器矩阵 | [TESTING](TESTING.md) | `vite.config.ts`、`playwright.config.ts`、`visual-coverage.json` |
| 已实现与待验收 | [PROGRESS](PROGRESS.md) | 当前 main 与证据入口 |
| 追溯旧方案/验收 | [历史交付](history/DELIVERY.md)、[UI 排查](history/UI-AUDIT.md)、[现场基线](history/BASELINE.md)、[旧规划](history/PLAN.md) | 历史快照，不是当前约束 |

本地检查、隔离 Neon 验证、提交和发布统一遵循[共享 TESTING](../TESTING.md)。
