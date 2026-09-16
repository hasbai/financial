# Financial 项目指南

个人财务管理，Svelte 5 SPA / TypeScript / Bits UI / shadcn-svelte（preset b6sUj31yy）/ Tailwind CSS / Lucide / pnpm。Cloudflare Worker `financial`，域名 `financial.hasbai.xyz`；Neon hasbai / neondb / financial；Auth0 北极小站。

## 用户确认的边界

- 单人使用，访问权通过 Auth0 的 superadmin 角色管理，历史数据全部人民币。
- 仅使用现有 `financial.account`、`financial.transaction`、`financial.entry` 三张表，禁止新增表字段（包括 is_active、is_cash_equivalent、version、退款关联字段等）。
- 现金范围直接用资产下的“现金及等价物”子类。退款补在同一 transaction 内。视图不用 v_ 前缀。
- 所有业务视图、函数、类型均在 `financial`。不新增业务 schema，不加 ledger、member、draft、audit 或其他扩展表。
- 不为多用户、家庭共享、审计平台或草稿工作流做预设计。修改围绕总览、流水补录、科目匹配。
- 原有记录和 ID 必须保留。迁移先在隔离 Neon 分支验证，不能用开发分支数据覆盖生产。
- 浏览器只含公开配置和本人 Access Token；不保存数据库连接串、Auth0 密码/client secret、管理 API key。
- 权限由 Auth0 签发的顶层 role claim 映射 PostgreSQL superadmin，Data API 验证 JWT 签名、有效期和 audience，数据库使用 schema/对象 GRANT。禁止添加应用层或 SQL 的 subject/issuer/audience 重复检查、is_owner 或 read_* 权限封装。读视图 security_invoker，写函数固定 search_path，客户端无基表 DML。
- 数据库金额使用 numeric，接口取十进制字符串。保留现有业务报表定义和保存校验；前端以 Decimal 完成合计、分组、日期和页面格式转换。禁止为前端形状再添加 home、*_read、*_daily 等包装视图或读取 RPC。

## UI 与文案硬性约束

- 禁止任何解释性小字、常驻说明横幅、口径免责声明、操作教学和技术实现说明。不得用 tooltip、折叠说明或弹窗搬运这些解释；业务口径写入文档。
- 必要信息只能通过 UI/UX 体现：明确的字段标签、已选筛选、状态徽标、计数、禁用状态、字段校验、可操作空状态与明细入口。日期、金额、图例、科目名等业务数据保留；无障碍名称必须准确。
- 首页禁止“XX 笔交易待补录。以下仅反映完整交易的已记录范围，请核对期初覆盖情况。”及同类文案。待补录用带计数的入口承载。
- 以用户提供的三张 UI 图为视觉与层次基准：首页净资产主卡、资产/负债双卡、通栏现金流、损益（按最新要求：首页只放统计，交易明细通过日期下钻）；流水页汇总、搜索、筛选与按日卡片；补录页交易摘要、紧凑字段行与底部操作。扩展明细通过标签页或操作入口展开，不堆在总览下面。
- 参考图中的示例金额、涨跌幅、商户标志和 AI 置信度不得伪造。只显示真实可用的数据和可执行的功能，保留既有三表、单人账本边界。
- 修改任一页面时检查正常、加载、空数据、错误、隐藏金额、窄屏、深色与键盘路径，防止说明性文案回流。按 2026-09-16 最新要求使用 Playwright 自动化视觉回归，移动端、iOS/WebKit 优先；正常修改无需逐次人工或 AI 看图。设备模拟不声称真机验收，详见 docs/TESTING.md。

## 文档与代码路由

| 工作 | 入口 |
| --- | --- |
| 当前完成情况 | docs/PROGRESS.md |
| 范围与执行步骤 | docs/PLAN.md |
| UI 与交互 | DESIGN.md、docs/UI-AUDIT.md、src/pages |
| 数据与口径 | docs/DATABASE.md、docs/DOMAIN.md、database/migrations |
| 接入与发布 | docs/ARCHITECTURE.md |
| 历史基线快照 | docs/BASELINE.md |

## 校验与提交

按2026-09-16最新要求，自动化验证统一在GitHub Actions执行，本地不运行单元测试、覆盖率、Playwright浏览器测试，也不运行整套typecheck/build验收。`Check / check`负责`pnpm typecheck`、`pnpm test:coverage`、`pnpm build`；`Check / visual`负责`pnpm test:e2e`。本地可做代码阅读、编辑、格式化和`git diff --check`。

每次改完代码，由主代理完成修改和提交，必须新派一个子代理负责推送功能分支、创建/更新PR、跟踪该次提交的CI结果。子代理回报失败后由主代理修复；下一轮仍派新子代理推送复核。禁止本地补跑测试代替CI，禁止将未通过的修改直接推送main。只有最新提交的`check`与`visual`均成功，且分支已包含最新main，才允许通过PR合并。合并后由子代理核验main检查、Cloudflare自动部署及线上版本。不得使用`--admin`绕过检查。

视觉基线只在有意设计变更时，显式对功能分支dispatch `Check` workflow并启用`update_visual_baselines`，从CI下载候选工件，核对后提交。随后普通push/PR必须在不更新基线的模式下通过；CI不自动接受变化，无需Docker。详见docs/TESTING.md。仓库现为public，main已强制PR、最新main及check/visual成功，管理员也不能绕过；禁止强推和删除main。
数据库验证用 `scripts/test-database.mjs`，连接串从 stdin 传入，所有测试写入在事务中回滚。不得输出凭据。

独立区分自动化、真实 JWT/API、浏览器与部署验收。完成修改时，必要的生产数据库迁移、提交、推送属于同一次交付，不再另行等待发布授权。涉及数据库时先在隔离 Neon 分支验证，再迁移生产并核验真实 API，然后仅暂存任务文件、提交，由子代理推送功能分支并核验CI。PR合并到main后触发Cloudflare自动部署，必须核验构建结果和线上版本；不要重复手动部署。需要新旧版本兼容的迁移应安排兼容步骤，不能只推前端而遗漏数据库。
