# Financial 项目指南

## 当前状态

本项目目前处于规划阶段，没有应用实现。`docs/PROGRESS.md` 是完成情况唯一入口；文件中的「拟新增」对象和接口均不是现有能力。用户本轮要求先出方案、文档与完成情况，后续开发按新的任务推进。

目标栈：React SPA、TypeScript、Vite、Material UI、pnpm、Cloudflare Workers Static Assets、Neon Data API、Auth0。数据位于 Neon `hasbai` 项目 / `neondb` / `financial` schema。

## 文档路由

只读当前任务相关文档，不默认加载全部文档，不重复读取已在上下文中的文件。

| 任务 | 首先读取 |
| --- | --- |
| 功能范围、阶段与交付 | `docs/PLAN.md`、`docs/PROGRESS.md` |
| 页面、组件、动效 | `DESIGN.md` |
| 记账规则、报表计算 | `docs/DOMAIN.md` |
| 表结构、迁移、视图、RPC | `docs/DATABASE.md`、`docs/BASELINE.md` |
| Auth0、Neon 接入、部署 | `docs/ARCHITECTURE.md` |

## 实施约束

- 保留现有 `financial.account`、`financial.transaction`、`financial.entry` 的记录和 ID，采用增量迁移。
- 基线快照会过时，迁移前重新核查；开发写入先在 Neon 隔离分支验证。
- 浏览器只能使用公开配置和当前用户 Access Token；不得放入数据库密码、Auth0 client secret、Neon 管理 API key。
- 数据授权在数据库执行；不能依赖 React 路由守卫或请求中的账户 ID、用户 ID。
- 交易及分录的持久化使用原子 RPC，实施幂等、版本冲突和服务端金额校验。
- PostgreSQL `FUNCTION` 是 Data API RPC 的实现载体；不要把 `PROCEDURE/CALL` 当作兼容接口。
- 金额用数据库 numeric；API 使用十进制字符串。前端不得用浮点累加形成权威报表。
- 付款渠道不是会计科目；匹配分录使用稳定的 `account.id`，不依赖展示名称。
- 补录不应自动改变付款状态；退款不应仅按状态排除。遵循 `docs/DOMAIN.md` 的口径。
- UI 移动端优先，采用 MUI 免费开源组件，不引入 Pro/Premium 依赖；不得把 MUI 默认样式称为完整 Material 3 实现。
- 不更改共用 Auth0 application、Neon Data API provider、`public` schema 或已有消费者配置，除非当前任务明确覆盖并完成影响核查。
- 每个阶段更新完成情况，分别记录自动化、真实 API、浏览器和部署验收。未执行的检查必须明确标注。

## 验证与 Git

当前可用：`git status --short --branch`、`git diff --check`。应用命令尚不存在，建立脚手架后按实际 `package.json` 更新这里。

仅暂存本次任务文件；实现与校验完成后提交并同步到用户指定的 GitHub 仓库。生产数据库变更和部署按当前任务授权执行，不把文档提交当作部署授权。
