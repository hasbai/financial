# Hasbai monorepo 项目指南

2026-09-23：新增 `apps/blog`（SvelteKit SSR）、迁移财务至 `apps/financial`。共享 Luma UI、Auth0 与 PostgREST 位于 `packages`。博客使用 `public` 四表和 R2 `image`，业务边界见 docs/BLOG.md。以下三表/schema/基表 DML 限制仅适用于 financial 业务，不限制明确授权的博客四表。所有既有财务脚本、视觉清单相对路径以 `apps/financial` 为工作目录；CI 等待脚本仍在仓库根。

## Monorepo 应用定位

仓库目录名 `financial` 是 Hasbai monorepo 的历史名称，不代表当前任务属于财务。先按用户所指应用定位：

| 应用 | 代码 | 文档入口 |
| --- | --- | --- |
| 财务 / 北极账本 | `apps/financial` | `docs/ARCHITECTURE.md` |
| 博客 / 北极小站 | `apps/blog` | `docs/BLOG.md` |
| Zboard | `apps/zboard` | `apps/zboard/README.md` |
| 酒馆 / Tavern | `apps/tavern` | `docs/TAVERN.md`、`docs/TAVERN-PROGRESS.md` |

目标目录缺失时，先核对 `git status --short --branch`、`git worktree list` 与最新 `origin/main` 的目录树；可能是当前分支早于应用合并，或应用位于另一个工作区。核对后复用包含目标应用的干净工作区，不因当前分支缺目录要求用户重新提供已存在的项目地址；不为定位强行切换、重置或覆盖其他任务。机器专属工作区路径不作为永久代码入口。以下 Financial 专属业务限制仅适用于财务，其他应用按各自章节和文档执行。

## 项目实现原则

- 修改用户内容前，必须先说明具体文案、位置和改动范围，并获得用户同意。用户提供的问题、外部审核退回信息或合规建议本身不构成改稿授权；未经同意不得追加说明、改写正文、替换已编辑内容或发布内容修改。执行只限已获确认的范围。
- 博客首页保留用户原有主体文案。当前仅授权在页脚“隐私政策、服务条款”链接下面左对齐，以小字显示“本站公开阅读，编辑发布需登录后使用。”，不得自行扩展为应用介绍、权限说明或合规声明。
- 禁止过度设计：围绕已确认需求选择直接、可维护的实现，不增加不必要的抽象、校验门槛或服务依赖。
- 尽量复用统一 UI：优先使用 `packages/ui` 的共享组件；可复用的现有组件先共享，再由应用引用，避免各页面重复实现通知、表单和弹层。
- 北极小站各应用的通用能力统一放在共享 `packages`，不为单个应用另做同类实现。登录统一使用 `packages/auth` 与 `auth.hasbai.xyz` 的 Auth0 Universal Login，提供邮箱、Google、Microsoft Account、GitHub；不得按应用强制单一登录连接。业务权限和各 API 的 audience 边界按既有约定保留。

# Financial 应用指南

个人财务管理，Svelte 5 SPA / TypeScript / Bits UI / shadcn-svelte（Luma，共享 packages/ui）/ Tailwind CSS / Lucide / pnpm。Cloudflare Worker `financial`，域名 `financial.hasbai.xyz`；Neon hasbai / neondb / financial；Auth0 北极小站。

## 用户确认的边界

- 单人使用，访问权通过 Auth0 的 superadmin 角色管理，历史数据全部人民币。
- 仅使用现有 `financial.account`、`financial.transaction`、`financial.entry` 三张表，禁止新增表字段（包括 is_active、is_cash_equivalent、version、退款关联字段等）。
- 现金范围直接用资产下的“现金及等价物”子类。退款补在同一 transaction 内。视图不用 v_ 前缀。
- 所有业务视图、函数、类型均在 `financial`。不新增业务 schema，不加 ledger、member、draft、audit 或其他扩展表。
- 不为多用户、家庭共享、审计平台或草稿工作流做预设计。修改围绕总览、流水补录、科目匹配。
- 迁移须保留原有记录和 ID；2026-09-18 用户明确授权通过界面修改科目 ID、删除单笔交易及分录、删除无引用科目。迁移先在隔离 Neon 分支验证，不能用开发分支数据覆盖生产。
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


CI 等待统一使用 `node scripts/wait-ci.mjs <owner/repo> <run-id> <full-sha> <event>`；一个运行只启动一次等待，主代理不并行轮询，终态齐备立即结束。本地截图审阅导入后由普通 CI 严格比较；具体超时、失败和停止条件见 [CI 等待与收尾](docs/TESTING.md#ci-等待与收尾2026-09-20)。

## 校验与提交

凭据文件（如`.env`）只能通过程序化读取用于已授权请求；禁止用`cat`、`rg`、`sed`等回显配置值，也不得打印完整环境、认证头或令牌管理API响应。诊断只输出预先选定的状态、资源ID、构建SHA等非敏感元数据；子代理交付同样遵守。

完整验收在最终创建 PR 时由 GitHub Actions 执行；本地可运行 `pnpm visual:local`，只生成受影响页面的截图并审阅，使用生产构建与独立浏览器夹具。单元覆盖率和完整视觉比较仍由 CI 执行；本地普通非视觉改动至少运行 `git diff --check` 和直接相关的轻量检查。

前端、共享 UI、API 契约和影响页面结果的改动由主代理修改并提交；本地 Linux 镜像截图审阅完成、需要的基线已导入后，再派新子代理推送功能分支并创建 PR，跟踪该次 CI。失败后由主代理修复，再派新子代理复核。PR 最新提交的 `check`、`visual`、`blog-check`、`blog-visual` 必需状态成功且分支包含最新 main 才能合并；Zboard 改动还须通过对应工作流。仓库只允许 squash 合并，使用 `gh pr merge --squash`。只有确认与前端输出无关且完成相关本地验证的独立改动可由维护者使用 `pnpm direct:push --validated --backend-reviewed --reviewed-path=<文件>` 快进推送 main；每个非文档文件各列一次，纯文档可省略参数。不得强推，不得将混合改动归为非前端。合并或直推后核验 Cloudflare 自动部署及线上版本。不得使用 `--admin` 绕过 PR 失败。

功能分支 push 和合并后的 main push 不触发测试；只在准备合并时创建 PR，使完整 CI 通常运行一次。个人账号仓库不支持 GitHub merge queue，故 PR 后更新提交或 main 前进仍会重跑必需检查。页面修改维护 `visual-coverage.json` 的页面、状态和设备证据；新增页面未登记会被门禁拒绝。视觉基线只在有意设计变化时由本地固定 Linux 镜像生成并审阅，使用 `pnpm visual:baseline:import-local <运行目录> --reviewed` 导入。CI 不自动接受变化。详见 docs/TESTING.md。
数据库验证用 `scripts/test-database.mjs`，连接串从 stdin 传入，所有测试写入在事务中回滚。不得输出凭据。

独立区分自动化、真实 JWT/API、浏览器与部署验收。完成修改时，必要的生产数据库迁移、提交、推送属于同一次交付，不再另行等待发布授权。涉及数据库时先在隔离 Neon 分支验证，再迁移生产并核验真实 API，然后仅暂存任务文件、提交，由子代理推送功能分支并核验CI。PR合并到main后触发Cloudflare自动部署，必须核验构建结果和线上版本；不要重复手动部署。需要新旧版本兼容的迁移应安排兼容步骤，不能只推前端而遗漏数据库。

## Zboard 应用

`apps/zboard` 为 Svelte 5 SPA / 共享 Luma neutral UI / Auth0 / Worker / D1，业务说明见 `apps/zboard/README.md`。财务三表及 Neon 限制不适用于 zboard。用户确认项目未上线且无旧业务数据，首次 Auth0 登录创建禁用用户，管理员分配权限与节点，不实现旧账户关联。认证必须使用独立 zboard API audience。D1 保留原资源，零流量不上报落库；不得把服务端配置或私钥用于生成用户订阅。`Zboard` workflow 的 zboard-check/zboard-visual 同样必须通过，本地生成并审阅 zboard 截图；本地禁止测试/typecheck/build。发布沿用 Cloudflare Workers Builds，不另行手动重复部署。

## Tavern 应用

`apps/tavern`：私人角色扮演对话，Svelte 5 SPA / 共享 Luma / 北极小站统一 Auth0 配置 / Worker / D1 / 私有 R2。财务三表限制不适用。当前模型由服务端固定 AI Gateway `dynamic/rp`；模型选择按 [模型与续聊方案](docs/TAVERN-MODEL-SETTINGS.md) 演进，只接受服务端白名单逻辑 ID，不接受任意上游模型、路由、URL 或密钥；全部会话由服务端持久化，角色扩展脚本不执行。方案见 `docs/TAVERN.md`。Tavern workflow 的 `tavern-check`/`tavern-visual` 必须通过；`pnpm visual:tavern --all` 在同一固定 Linux 镜像生成审阅基线，交付沿用主代理修改提交、新子代理 PR/CI/squash、Workers Builds 自动部署与线上核验。公开角色目录同步采用固定 revision/完整校验/原子切换，不将失败的上游结果伪装成搜索成功。

Tavern 复用 `packages/auth` 的北极小站配置及公共 JWT claims，禁止增加 Tavern audience 限定或专属用户名签发条件。仍验证共享 audience、签名、有效期与 superadmin。Gateway 保存完整请求和回复，统一三项 metadata。

2026-10-04：删除会话时必须同时清理对应DO全部存储与alarm，清理成功后才返回；D1删除标记阻止旧来源复活，失败可重试，不永久保留DO tombstone。构造函数及已删除对象的旧请求不得重建存储，详见[删除一致性契约](docs/TAVERN-AGENT-PLAN.md#do与迁移一致性)。
