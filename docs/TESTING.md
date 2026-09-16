# 测试规范与覆盖审计

## 运行

按2026-09-16最新要求，以下命令仅由GitHub Actions runner执行，日常开发不在本地运行测试、覆盖率、Playwright、typecheck或build验收。

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install webkit chromium
pnpm typecheck
pnpm test:coverage
pnpm test:e2e
pnpm build
git diff --check
```

无需Docker。CI视觉任务固定在`macos-26` ARM64，单元测试在Ubuntu。Playwright精确锁定版本，使用`darwin-ci-*`截图基线。历史`darwin-*`本机基线保留为旧验收记录，不再在本地运行或更新。

`pnpm test:e2e:update`仅在初次建基线、设计变更或明确的浏览器/系统升级时，由功能分支的显式workflow dispatch执行。普通运行使用`updateSnapshots: none`，缺少图片或超出差异即失败；push/PR的CI不自动更新、不重试掩盖不稳定。显式触发Check workflow的`update_visual_baselines`生成CI候选工件并立即无更新复跑；它不自动提交，取回并核对后提交。报告保留expected/actual/diff和失败trace。日常不要求人工或AI逐页看图，有意设计变更仍需核对差异。

## 推送与合并

主代理编辑/提交后，必须派新子代理负责功能分支推送、创建或更新PR和跟踪CI；主代理处理失败并提交修复，再派新子代理核验。检查必须对应PR最新提交，`Check / check`（类型/单元覆盖率/构建）和`Check / visual`（浏览器/视觉回归）全部成功，且已包含最新main后才能合并。`workflow_dispatch`生成基线的成功不能替代随后普通push/PR的比较结果。不得本地补跑或用管理员绕过失败；合并后继续核验main与Cloudflare自动部署和线上资源。

目标分支保护：强制PR、最新main、必需状态`check`与`visual`（GitHub Actions app），管理员同样受限，不允许force push或删除main。本次GitHub API对私有仓库hasbai/financial的protection/rulesets返回“Upgrade to GitHub Pro or make this repository public to enable this feature”，因此目前只有工作流程约束，不能声称GitHub已阻止手动绕过。保持仓库私有；账户套餐支持后再启用强制保护。

## 分层边界

| 层 | 责任 | 不承担 |
| --- | --- | --- |
| Vitest 纯函数 | Decimal、金额合法性、日期半开边界、分录分配、原 ID、安全返回路径 | 浏览器布局 |
| Vitest 组件/API | 保存载荷、退款、冲突/不确定保存、筛选与分页、会话缓存、HTTP 协议 | 每个 CSS 类、每句源码、第三方组件实现 |
| Playwright | 真实 Svelte/Shell/Repository、样式、路由、触控目标、焦点、截图差异 | 生产凭据、真实数据库、Auth0 登录契约 |
| 数据库脚本 | 三表边界、原子保存、权限、退款和报表、余额历史连续性 | 固定个人账本记录数 |
| JWT/API 脚本 | 本人真实登录、网关拒绝非法身份、生产读取与数值核对 | 像素布局、真机体验 |

API 查询参数、numeric 字符串、分页游标以及请求去重数量是已有接口/性能契约，保留必要精确断言；不因其使用 mock 或计数就机械删除。SQL 两个脚本分别负责保存/报表基础与余额历史，保持独立可运行；共同检查三表和权限是入口前提，不抽成通用测试框架。历史包装对象不存在的检查保留为已执行迁移的约束。

## 浏览器覆盖

- iPhone 13 / WebKit：完整移动流程与各业务页的正常、加载、空、错误状态；隐私、深色、科目新增失败重试、缩小视口下焦点与保存按钮。
- iPhone SE / WebKit：窄屏正常流程、深色隐私、编辑与二级科目选择。
- Pixel 7 / Chromium：同一移动关键流程的另一浏览器引擎。
- 桌面 Chromium：侧栏、Dialog、键盘打开/关闭、拒绝丢弃后的输入保留。

主矩阵集中在 WebKit，状态组合不在所有设备重复。关键操作额外检查 48px 触控区域、视口内可见与中心命中，避免单纯把现有截图照收为基线。选择器优先 role/label，不复制 DOM 树或给每个控件加 test-id。

`e2e/index.html` 是独立开发入口，复用现有 `src/test/Harness.svelte`、生产样式、Shell、路由、QueryClient 和真正的 Repository；HTTP 层返回合成数据，非本地请求直接失败。日期、时区、语言、动画、主题固定。入口与 fixture 不参与生产构建，生产 App 没有跳过认证的开关。

Playwright iPhone 项目是 WebKit 设备模拟，不是 iOS Safari 真机。缩小 viewport 验证 VisualViewport/焦点滚动，不声称验证系统软键盘、刘海安全区实际值、PWA 安装或系统返回手势。生产 Service Worker 仍由现有生命周期单测覆盖，此浏览器套件阻止注册 SW 以保证请求隔离。

## 2026-09-16 审计

原基线 14 文件 / 96 项；行 89.16%、分支 80.20%、函数 85.61%。原项目没有覆盖率配置，此数值由本次 v8 实际执行取得。

| 文件/范围 | 处理与理由 |
| --- | --- |
| finance / cashflow / presentation / business-entries | 保留金额、日期和业务分录；对象不变性从 JSON 字符串改为结构比较 |
| auth / router | 保留回调安全、令牌、导航与未保存保护 |
| mobile-viewport | 清理按监听器数量断言，改为检查注册事件的正确解绑；浏览器补充缩小视口回归 |
| api | 将旧 ledger/home 负面断言改为准确保存载荷和允许读取对象列表；根据覆盖缺口增加生活/投资/融资分类及优先级，保留 precision/filter/keyset |
| Pages | 移除重复显隐、已删除日报结构断言；设置/新增导航移到浏览器 |
| Editor | 移动加载/错误及桌面 Escape 行为移到浏览器；保留退款、分配、ID、失败不丢输入等业务测试 |
| RequestLoading | 去除旧 home 字段与 SQL select 文本探针；合并显隐；保留跨页/跨日/退出/保存/聚焦重连的请求复用契约 |
| ui-copy | 删除全目录源码正则黑名单；页面文案变化由截图差异与 UI 规范约束 |
| pwa / pwa-registration | 保留离线/升级/重定向/旧 chunk/不缓存认证请求；这些是已复现故障而非假设性防御 |
| DB / JWT 脚本 | 移除 86 / 54 等生产数量常量；错误 audience 必须 HTTP 拒绝，不接受 200 空数组；去除旧 home 路径和偶然耗时输出 |

v8 覆盖范围含全部业务 TS/Svelte，排除测试与 fixture、无运行时代码的类型、生成的 shadcn 基础组件。生产入口/认证/外壳不因难测而排除。Playwright WebKit 不提供与 V8 兼容的覆盖数据，因此不伪造合并覆盖率；导航迁出 jsdom 后 Shell/Settings 的 Vitest 覆盖下降在预期内。报告应结合分层用例表阅读，不为 100% 添加重复或不可达防御分支测试。

覆盖报告：`coverage/index.html`；浏览器报告：`playwright-report/index.html`。CI 两者均保留 14 天。

覆盖率门槛按分层后的实测设定：全局行 83%、分支 75%、函数 78%、语句 80%；核心金额/API/分录模块行 90%、分支 74%、函数 90%、语句 88%。门槛防止明显倒退，不为达到百分比放宽断言或排除业务代码。

## 本次验收结果

- 规范后 Vitest：13 文件、91 项全部通过；语句 83.62%、分支 77.04%、函数 81.21%、行 84.94%。相对 96 项基线删去重复/迁移 6 项、新增现金分类业务用例 1 项。行覆盖下降主要来自 Shell/Settings 和移动/桌面表现迁到浏览器，业务代码仍计入覆盖分母。
- Playwright：25 项、34 个截图场景（本机/CI各一套），连续三轮 75/75 通过。正常运行没有更新截图。
- 故意给首页加入 12px 横向位移，正常截图比较以 21,390 像素差异失败；已恢复原测试文件，基线未改动。证实视觉检查能拦截布局偏移，不是只生成截图。
- 实测发现 WebKit 缩小视口后备注字段在屏幕外。修复为 EditorSurface 监听滚动容器实际尺寸变化后定位焦点字段，取代不稳定的 viewport 事件/rAF 时序猜测。上述重复运行包含这条回归。
- typecheck、build、git diff --check 通过，生产构建不含 e2e 入口与 fixture token。
- 隔离分支 `financial-role-access-20260915` / `br-divine-frost-b3dv0o2s`：数据库基础 47 项、余额历史 41 项通过，测试写入回滚。真实本人 PKCE/JWT 的 `check-api` 与 `check-home-api` 通过。
- 未执行 iOS 真机验收；CI、部署结果单独记录于 PROGRESS。

CI首次跨环境比较检出字体栅格化差异后，单独建立GitHub runner基线；显式dispatch在同一runner上25/25生成并25/25正常比较通过，未放宽50像素阈值。后续push/PR仍严格比较仓库内CI基线。

## 2026-09-16 弹层回归补充

此前 `account-picker.png` 实际包含已有交易的分类弹层，但没有新增交易付款账户、拆分/多账户入口或弹层打开后缩小视口的检查。`fitsViewport` 只检查文档横向宽度，不能发现 portal 弹层的纵向越界；固定fixture只有少量科目，未覆盖长列表。全局减少动态效果及截图禁用动画，也不能验收滑入/退出。标题30px和窄屏换行已经存在于旧基线，截图一致不代表字号合理。

本次在原代码的WebKit/iPhone SE和Chromium固定视口中，分类及账户弹层均位于视口内，未复现用户实际设备的越界，不能把潜在键盘/视口因素当作已证明根因。修复统一使用可见视口底部容器，打开时不自动聚焦输入框；实际iOS软键盘/浏览器平移仍属于真机边界。

新增断言检查弹层四边及贴底位置、搜索和末尾选项命中、滚动后新增入口、缩小/横屏视口、长分类和长科目、空搜索、键盘选择/退出及焦点恢复；覆盖付款/到账/转账/扣款/高级分录/流水筛选/退款/科目类型。字号直接检查computed style；普通动态效果下检查真实animationstart、位移方向和退出动画，减少动态效果单独验证。打开的分类和付款弹层、深色弹层、新增交易页加入截图基线。

新增检查实际检出并修复：搜索输入只有36px触控高度，以及WebKit中SelectField选择关闭后焦点丢失。日常CI仍只比较显式提交的基线，不自动接受截图变化。
