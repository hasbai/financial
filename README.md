# Financial · 个人财务系统

移动端优先的个人财务系统，以现有复式记账数据为基础，完成「查看财务状况 → 发现待处理交易 → 补录信息与匹配科目 → 更新报表」的闭环。

**当前阶段：方案与文档已完成，应用尚未开发。** 真实服务检查与实施进度统一维护在 [完成情况](docs/PROGRESS.md)。

## 方案结论

采用 **React + TypeScript + Vite SPA、Material UI、pnpm**。Cloudflare Worker `financial` 托管静态资源，目标域名为 `financial.hasbai.xyz`；浏览器通过 Auth0 登录后直接调用 Neon Data API，报表计算和交易写入由 PostgreSQL 视图、函数完成。

该方案可以做到**无需自建业务 HTTP 后端**。上线前必须验证 Auth0 JWT、Data API、数据库权限和 RLS 的完整链路。现有 API 已启用，但业务权限与 RLS 尚未接好；不能将当前状态理解为已具备安全直连条件。需要外部密钥、异步导入或无法满足 JWT 验证要求时，再增加 Worker API。详见 [架构方案](docs/ARCHITECTURE.md)。

## 首期页面

| 页面 | 核心能力 |
| --- | --- |
| 总览 | 资产、负债、净资产；现金流入流出；收入、支出和损益；数据完整性提示与明细下钻 |
| 流水 | 日期分组交易卡片、筛选、手工新增、补录、账户/科目匹配、拆分分录、保存后继续处理 |

账户搜索与选择嵌入流水编辑；账户管理先作为辅助入口，不扩张为完整管理后台。

## 文档导航

| 文档 | 内容 |
| --- | --- |
| [实施规划](docs/PLAN.md) | 首期范围、阶段依赖、交付物、验收标准和待确认口径 |
| [UI 与交互设计](DESIGN.md) | 移动端线框、总览、交易卡片、编辑流程、动效与可访问性 |
| [架构方案](docs/ARCHITECTURE.md) | 纯前端可行性、开源选型、Cloudflare 与 Auth0 接入、安全边界 |
| [业务口径](docs/DOMAIN.md) | 复式记账、三类报表、退款、期初、现金范围与完整性规则 |
| [数据库与接口](docs/DATABASE.md) | 已有模型、增量迁移方案、视图/RPC 契约、授权和并发 |
| [完成情况](docs/PROGRESS.md) | 已完成、待开发、受阻事项与验证证据 |
| [现场核查](docs/BASELINE.md) | 2026-09-13 的只读检查结果 |
| [Agent 指南](AGENTS.md) | 后续实现的文档路由与约束 |

## 仓库与开发

- GitHub：[hasbai/financial](https://github.com/hasbai/financial)，本轮创建为私有仓库。
- 当前仓库只有规划文档和只读核查 SQL，没有 `package.json`、应用代码、迁移或部署配置。
- 本机已验证 Node.js `v24.14.1`、pnpm `10.33.2`。应用阶段再固定依赖版本、`packageManager` 与 `pnpm-lock.yaml`。
- `pnpm dev`、测试、构建和部署命令将在脚手架建立后提供；目前不可运行。
- 不提交真实流水、金额明细、账户号码、数据库连接串或令牌。文档示例使用虚构数据。

技术依据：[Neon Data API](https://neon.com/docs/data-api/overview)、[Auth0 外部身份接入](https://neon.com/docs/data-api/custom-authentication-providers)、[Cloudflare SPA 托管](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)。
