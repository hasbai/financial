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

`pnpm test:e2e:update`仅在初次建基线、设计变更或明确的浏览器/系统升级时，由功能分支的显式workflow dispatch执行。普通运行使用`updateSnapshots: none`，缺少图片或超出差异即失败；PR/main的CI不自动更新、不重试掩盖不稳定。显式触发Check workflow的`update_visual_baselines`只执行一次完整候选生成（保留交互与覆盖清单断言），不在候选内部再全量复跑；它不自动提交，取回并核对后提交，随后普通PR/main必须严格比较通过。候选运行只产生`candidate-check`与`visual-baseline-candidates`状态，不能满足或覆盖分支保护要求的`check`/`visual`。额外稳定性复跑只用于已复现抖动或明确排障，并记录原因。报告保留expected/actual/diff和失败trace。日常不要求人工或AI逐页看图，有意设计变更仍需核对差异。

## 推送与合并

主代理编辑/提交后，必须派新子代理负责功能分支推送、创建或更新PR和跟踪CI；主代理处理失败并提交修复，再派新子代理核验。检查必须对应PR最新提交，`Check / check`（类型/单元覆盖率/构建）和`Check / visual`（浏览器/视觉回归）全部成功，且已包含最新main后才能合并。`workflow_dispatch`生成基线的成功不能替代随后普通PR/main的比较结果。不得本地补跑或用管理员绕过失败；合并后继续核验main与Cloudflare自动部署和线上资源。

已启用分支保护：强制PR、最新main、必需状态`check`与`visual`（限定GitHub Actions app id 15368），管理员同样受限，不允许force push或删除main；单人开发不额外要求人工审批。因私有仓库当前套餐不支持保护，用户已明确授权并完成将hasbai/financial设为public；保护设置已由GitHub API成功返回并确认。

## CI 等待与收尾（2026-09-20）

每个仓库、每次交付只由一个新子代理负责推送、候选/CI/合并和部署核验，主代理不并行查询同一运行。派发时给出任务工作树、允许提交的文件、目标 SHA、PR 与所需验收阶段；CI 失败后返回具体失败证据，由主代理修改，再派新子代理。候选待审时返回工件即可，不提前启动必然因旧基线失败的普通验收。

发现当前运行 ID 后，用仓库内命令等待一次；SHA 使用 GitHub 该运行的完整 head SHA，event 必须符合所需阶段：

```sh
node scripts/wait-ci.mjs hasbai/financial <run-id> <full-run-head-sha> pull_request
```

命令先核对仓库、run ID、SHA、event；对进行中的运行只启动一个 `gh run watch --interval 30`，中间重复进度不进入代理上下文，结束后只读取一次终态证据。默认最多等待20分钟（可追加1–1800秒），两次元数据请求各限15秒；不启动或重跑CI。退出0只表示该运行成功，1表示失败/取消/跳过/证据不匹配/API不可读，2表示仍待完成。返回2或API失败时保留运行链接和明确状态，不把未完成当通过，也不立即循环重开watch；只在新的状态证据或明确继续要求下恢复。

工具返回进程/执行cell仍在运行时，只续等同一进程；每次使用工具支持的较长等待（本地执行最多60秒），禁止每几秒调用`gh run view`/`gh pr checks`，禁止重启watch或把日志中的重复进度当成新证据。主代理仅等待子代理完成，不读取同一日志、不重复验收。

失败时只下载当前运行的失败job日志、对应截图/trace一次；区分代码缺陷、测试假设、预期视觉变化与runner/API故障。未修改代码/基线/环境且无临时基础设施故障证据时，不盲目重跑；同一问题修复后仍失败，应先重新判断根因。

停止条件：所需普通验收成功、PR合并已确认，以及本任务涉及的部署结果/版本已核对后立即回报并结束；不再额外跑测试、下载已成功的整套artifact或扩展至无关页面。CI/文档工具变更不追加业务登录或浏览器专项验收。回报只需PR、代码/合并SHA、各必要run链接与结论、部署证据及实际未验收项；候选成功和轻量入队成功都不得报告成完整CI通过。

## 视觉变更的提交前准备

先判断是否改变页面视觉，列出影响的页面、状态和设备；更新 `visual-coverage.json` 的对应场景。无意视觉变化时不更新 baseline，差异须先定位根因。需要更新时，由交付子代理先推送功能分支，**先生成候选、后创建 PR**，不要等待比较失败才补截图。普通分支 push 不触发完整验收；所有 PR（含草稿）及 main push 仍运行必需检查，不能跳过视觉比较。

```sh
gh workflow run check.yml --ref <task-branch> -f update_visual_baselines=true
gh run download <candidate-run-id> -n visual-baseline-candidates -D <outside-checkout-directory>
# 主代理核对候选与旧图及变化范围后执行；不会自动提交。
pnpm visual:baseline:import <outside-checkout-directory> --reviewed
```

工件记录生成 SHA、run ID、各 CI PNG 的 SHA-256。导入要求工作树干净、HEAD 与生成 SHA 一致，并验证路径和校验和；代码变化后必须重新生成。候选严禁直接写 main，不自动提交，不替代随后 PR 普通比较。既有 PR 内有视觉变更时主动生成候选，最终只接受最新提交的严格比较成功；不要为避免红灯关闭必需检查。

## 页面覆盖清单门禁

`visual-coverage.json` 是页面、URL 场景、状态、设备、测试标题与活跃 CI 截图的可检查清单。`check:visual-coverage` 比对真实页面文件；新增页面、清单遗留项、缺少证据或 baseline 会失败。候选准备只允许暂缺 PNG，不能绕过清单与测试要求。Dashboard 另核对现有导航 registry 的动态视图；Financial 另核对 Shell 的 URL 分支，新 view/URL 不会因复用同一页面组件而漏掉。

全量 CI 设置 `VISUAL_COVERAGE_GATE=1`，reporter 再核对声明的测试确实在指定设备执行并通过；截图条目必须逐一实际执行清单所列文件名的 `toHaveScreenshot`，单纯 `page.screenshot`、跳过或删去测试不计作覆盖。`test-results/visual-coverage.json` 保留清单、豁免及结果。该清单不是代码覆盖率，单个正常态不代表所有状态；已有缺口必须写明豁免原因，不计入已覆盖，修改相应页面时重新评估。常规有覆盖页面不需要新增重复测试。局部排障可不启用全量门禁，不替代 CI。

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

`e2e/index.html`是独立测试入口，复用`src/test/Harness.svelte`、Shell、路由、QueryClient和真正的Repository；HTTP层返回合成数据，非测试服务请求直接失败。CI先正常生产构建dist，再以e2e mode将测试入口单独编译到dist-e2e。`prepare-browser-build.mjs`用dist中的原样压缩CSS替换测试入口stylesheet，浏览器通过vite preview读取静态产物，不能再用Vite开发服务代替生产CSS。日期、时区、语言、动画、主题固定；入口与fixture不进入生产dist，生产App没有跳过认证的开关。

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

## 生产CSS弹层定位回归

用户后续反馈iOS PWA仍大面积裁切。已核对线上资源与main/CI artifact一致，并发现生产压缩将`translate:none`删除，而桌面`-translate-x/y-1/2`仍使用独立translate属性；`transform:none`不能覆盖该位移。原视觉任务启动Vite开发服务，没有验证压缩产物，因此36项通过仍遗漏真实线上错误。

先只切换CI到生产CSS（7048f64，run 35115492795）未修改UI，复现15项移动端四边定位失败，21项通过；截图确认负半宽/半高位移造成裁切。这是行为断言失败，未更新基线。修复将居中位移限定为sm桌面断点，手机不再依赖reset声明。已有贴底/动画/缩小视口/多入口回归继续使用实际生产CSS，并新增手机滚动条隐藏、编辑区及长列表仍可滚动的断言；不声称iOS真机验收。

## Baseline 前置与覆盖清单（2026-09-18）

候选运行 [35300447734](https://github.com/hasbai/financial/actions/runs/35300447734) 对应 `c25a067d94914cb5af750c9c6204e19bfc3ea1e5`，check、候选生成及不更新复跑均通过。新增 iPhone 13、iPhone SE、Android 的设置页基线，6 个业务 URL 家族均有正常态截图；原有 iPhone 异常状态登记到门禁。清单共 18 个状态场景，既有桌面覆盖仍按实际测试标注，不宣称桌面全覆盖。

候选导入实际校验了 HEAD 和 PNG 哈希。仅接受 3 张新增 settings.png，旧 account-picker、accounts、new-payment-sheet 的候选变化不属于本次视觉修改，保留原有 46 张基线。全部新增截图已核对文字、导航和窄屏布局；普通 PR/main 仍须比较通过。


## 2026-09-20 移动UI审阅增补

增加资产负债/现金流/损益面板、筛选主面板及已选条件、拆分收入、短屏深色科目编辑的截图和交互证据。日期下钻检查自然日标签及列表回到顶部；选择器嵌套后验证焦点返回；科目编辑验证屏外字段聚焦滚动和固定保存栏。

本轮候选首轮检出WebKit完整目标交叉比例的亚像素误差；reachable现在允许0.999交叉比例，同时逐边检查VisualViewport位置（0.5px容差）、中心命中及48px尺寸。第二轮进一步检出短屏表单焦点没有滚入可视区，已修复内部焦点/尺寸滚动。第三轮候选run 35511755521全部成功，68张候选已审阅；普通验收保持updateSnapshots:none。源生产移动页面曾通过Chrome DevTools MCP直接实查，CI仍使用合成数据和设备模拟。
