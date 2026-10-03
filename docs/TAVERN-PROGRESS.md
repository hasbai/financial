# Tavern 交付状态

2026-10-03。线上入口：[tavern.hasbai.xyz](https://tavern.hasbai.xyz)。完整方案、来源依据与后续路线见 [TAVERN.md](TAVERN.md)。

## 已交付

- `apps/tavern`：角色库、发现、世界书、持久对话和设置，复用 Svelte 5、Luma、Auth0。
- CCv1/v2/v3 JSON、PNG chara/ccv3、CHARX与独立世界书导入；原文件私有保留、原卡与标准 JSON 导出，未知扩展保留但不执行。
- 世界书关键词/副关键词/常驻/扫描深度/递归/优先级/排序/预算，用户 persona、角色、世界设定与历史提示组装。
- D1/R2、JWT superadmin访问、会话快照、生成幂等与锁、SSE、部分内容落盘、停止、重新生成、编辑分支、JSONL导出。
- TheatreLM原始5011条，经本轮质量隔离后5002条可用；revision `eb8597aec4e3e114b2d28b86c3e2496dd48c5af3`；worlds.json SHA256 `6acddc549996246cca97a3bda0560b9fbafe188920703815adeb33d3459b165a`。来源、署名、许可和转换标记随角色保存。
- 固定 `AI.run('dynamic/rp', ..., { gateway: { id: 'default' } })`；不接受前端覆盖模型或密钥，无隐式重试或备用模型。

## 首版验收证据（修订前）

| 层级 | 已验证结果 |
| --- | --- |
| 核心与类型 | 28项核心测试通过，覆盖格式、安全边界、世界书/Prompt/SSE、JWT、幂等、历史锁、原子绑定/删除/分支、过期恢复、空闲上游停止/断连及非流拒绝；Svelte diagnostics 0 errors / 0 warnings |
| 固定 Linux 浏览器 | 桌面 Chromium 与 iPhone WebKit 共14项流程、68张已审阅基线；5页面、7截图场景、零豁免，覆盖正常、空数据、错误、加载、深色、窄屏、键盘与延迟停止恢复 |
| 生产 D1/R2 | 两个迁移已实跑，目录5011条与release revision核验；专用JWT下搜索、安装、会话保存和私有R2原文件下载均成功 |
| 完整目录分页 | 第418页返回7个角色、无下一页；末页角色安装成功，不仅验证前1200条 |
| Auth0 | 独立 audience `https://tavern.hasbai.xyz/api`、增量回调、Action `2e74040a-2123-4721-8f4b-c4c3367eaf6c`；普通Universal Login + PKCE实际签发用户JWT，并通过Worker验签与权限检查 |
| 真实模型 | 生产应用SSE HTTP200、非空delta、done、无error；恢复查询得到assistant completed（77字符）；停止落aborted、会话锁释放，再次生成成功 |
| 测试数据 | 本次生产验收创建的会话、两张安装角色及先前失败探针会话均已清理 |
| PR与CI | [#26](https://github.com/hasbai/financial/pull/26) 和 [#27](https://github.com/hasbai/financial/pull/27) 最新head八项必需检查全成功，包含当时最新main，均squash合并 |
| 发布提交 | `c059b0c06268537305510a9ff8ed17f6bf0e49ce` |
| Workers Builds | Build `39390315-99e2-42fb-8192-5b10714886f9` success，固定main及上述提交；version lookup与deployment确认版本 `5d7dacf7-c40c-4e19-852a-baa9590e01cb`、权重100%；Node fetch `/health` HTTP200且版本一致 |

## 发布过程与兼容边界

旧Gateway universal compat绑定在生产返回500，最终改用2026-10-02官方文档支持的原生动态路由绑定，真实应用推理已通过。修复提交的两次Builds环境初始化超时，未进入clone/install/build/deploy；成功与失败trigger快照一致，无其他monorepo构建占用。通过官方Builds API对同一main提交串行重试，第三次成功；没有手动Wrangler发布，也没有通过假提交重跑CI。

Chub/CharaVault探针403；Chub保留失败状态与适配器，未声称该源搜索安装已验证。Risu没有公开搜索契约，不接未文档化接口。Dataset Viewer搜索超时/500，改为完整固定版本目录。复杂SillyTavern扩展仅保留；后续增强路线在方案中单列。

本地和CI设备模拟不代表真机。合成浏览器夹具仅用于独立dist-e2e，不进入生产dist；真实JWT/API/模型与部署验收分别记录。

## 使用反馈修订（2026-10-03）

六项全部交付：统一雪花标识；默认Chub上游热度/时间/分类；隔离9条损坏公共记录（5002可用）；Enter发送/Shift+Enter换行及IME保护；持久终止原因、4096默认与显式续写；收窄阅读列与输入区优化。具体诊断证据与契约见方案。

| 层级 | 本轮结果 |
| --- | --- |
| 代码 | 39项核心测试通过；Svelte0错误/0警告；续写原轮次超预算明确400且不丢前缀，生成/导出保留终止原因 |
| 浏览器 | 固定Linux桌面/iPhone WebKit22项流程、74张审阅基线；普通严格比较22项通过，50像素容差未改；Enter/Shift+Enter/中文IME、排序分类分页、长对话、异常恢复与续写均覆盖 |
| CI差异修复 | 初次PR仅iPhone编辑弹窗背景差828像素。trace证明消息区滚动21px，弹窗一致；显式定位阅读位置后chat-edit精确匹配原基线，无新增基线接受 |
| 生产迁移 | 0003/0004在本地和生产D1均成功；目录5002、损坏名称0、旧会话1024默认0；私人角色与历史保留 |
| 真实来源 | 用户PKCE/JWT下Chub热度、最新、Fantasy分类和第二页各12条；真实PNG安装/头像成功。TheatreLM第417页10条且无后页，已隔离的2921条不能安装 |
| 标识与头像 | 线上logo.svg与统一原资源逐字节一致；线上CSP精确允许avatars.charhub.io，未放宽为任意远程主机 |
| 真实生成 | 4096预算下角色回复completed/stop、65字；降回1024故意耗尽预算，正文0字但length/error及原因持久化、锁释放，避免静默“完成” |
| 真实停止/续写 | 有限三段对白任务中保存72字，stopped、锁释放；续写到207字completed/stop、前缀保留、无error事件、恢复一致、用户轮次仍1；JSONL保留停止与续写两个版本及原因 |
| 测试资源 | 网络/模型验收新增会话和角色均清理；原有用户安装未删除。较短回复提前完成造成stop竞争409及长任务未正常结束的验收探针分别记录，未算成功、未据此盲目改应用或隐式重试 |
| PR/CI | [#28](https://github.com/hasbai/financial/pull/28)，最终head e55c7887ac6be8a4d6b6fefe3a2dbfff08087c6a，包含当时main；[Check](https://github.com/hasbai/financial/actions/runs/37111789461)、[Tavern](https://github.com/hasbai/financial/actions/runs/37111789418)、[Blog](https://github.com/hasbai/financial/actions/runs/37111789427)、[Zboard](https://github.com/hasbai/financial/actions/runs/37111789422)，八项必需状态全绿，squash合并 |
| 自动发布 | main d129895eb9fbf7367651dee55e316da8cdc51443；Build31323226-d825-4a20-8ea3-db0e035e3d81成功；deployment2da46eba-0219-4d4d-b196-ad3e76a186fc，version a68f9a43-4900-4900-be39-559184ff54f3流量100%；线上health200版本一致，无手动重复部署 |

续写与普通生成仍受用户预算/175秒期限及上游模型影响；达到限制时持久显示原因，不能宣称无限输出。原始用户短回复未记录finish_reason，具体终态无法重建；同角色/输入复现与确定的终态误判缺陷已修复。设备模拟不等于iPhone真机验收。

## 模型配置与续聊候选（方案历史）

2026-10-03 已完成 [方案](TAVERN-MODEL-SETTINGS.md)，尚未修改应用或生产数据库：补齐参数默认值、默认关闭思考、白名单模型选择（首个为 RP 动态路由），同一次 roleplay 正文后顺带输出最多三条用户视角候选并支持点击发送，避免再次预填充；短上下文按上游明确能力反馈协商，HTML 架构图见方案。真实 RP 参数能力、关闭思考及候选延迟仍待验收；不能把现有过滤思考输出算作已关闭思考。

## Gateway 归属日志与 JWT 名称（2026-10-03）

原因已定位：线上 Worker 配置为 default Gateway，应用调用 `dynamic/rp`；原代码 `collectLog:false` 禁止整个 Gateway 日志，不是绕过 Gateway。修复启用日志、独立禁存 payload，服务端统一 `{app:"tavern",task:"roleplay",username:实际账户名称}`，eventId 关联 requestId。用户名由 Tavern 专属 Auth0 Action 写入签名 JWT，前端携带 Access Token，后端验签后直接读名称；没有逐轮 Management API 或 userinfo 调用。旧 Token缺名称时生成前明确重新登录，不使用角色名或 ID。

Auth0 Action 已先发布并回读匹配；真实新 Token包含“时阅”及原 superadmin，其他 audience 的 Action输出不变。相关 auth/生成36项测试和轻量检查通过。参数开关、同次候选与能力预算仅更新方案；HTML 四视图、桌面/390px/深色和16K/32K/unknown预算交互已检查，无JS错误或横向溢出。

发布与真实应用验收已完成：

| 层级 | 本轮证据 |
| --- | --- |
| JWT | audience限定 Action先部署且回读源码一致，实际Token签发username“时阅”；生成前直接取签名claim，不查资料接口 |
| 聚焦检查 | auth/生成36项、聚焦Worker TypeScript检查、差异/链接检查通过；HTML四视图、桌面/390px/深色、16K/32K/unknown预算交互通过 |
| CI | 初次仅测试Mock类型过宽导致typecheck失败，显式收窄AiRun修复；[Tavern](https://github.com/hasbai/financial/actions/runs/37116178794)、[Financial](https://github.com/hasbai/financial/actions/runs/37116178790)、[Blog](https://github.com/hasbai/financial/actions/runs/37116178747)、[Zboard](https://github.com/hasbai/financial/actions/runs/37116178758)最终8项必需状态全部成功 |
| 合并/发布 | [PR #29](https://github.com/hasbai/financial/pull/29)，main `46df3eed2261bc7819e6793606f8faaded845e36`；自动Build `9ca58891-6a5c-4738-b73c-236a1476407e`的commit_hash一致；version `d1dcdad0-ca41-47ea-9df7-8f94feca7bf8`流量100%，health200版本一致；无手动部署 |
| 真实应用 | 请求 `c1ea8534-0978-464a-a1ea-3ddac5cdf36e`，HTTP200、completed/stop、正文3字、0error、恢复一致、锁释放；故意传前端伪metadata不能改变服务端归属构造 |
| 返回模型 | Worker事件记录 `@cf/google/gemma-4-26b-a4b-it`；仅记录真实返回标识，不据此假定RP所有路由分支或上下文能力 |
| 测试数据 | 仅删除本次创建的临时会话与角色，原用户数据保留 |

Gateway 后台的同请求三个metadata及payload禁存尚待直接核实。本机Wrangler OAuth与受限Agent Token读取Gateway管理API返回403，用户正在补齐读取权限；原始响应未提供cf-aig-log-id，因此以requestId/eventId及时间核对。未将权限失败算作网关未记录，未将应用生成成功算作metadata存储验收通过。

## 模型与同次候选首轮实现（2026-10-03，后续简化取代）

共享参数默认值/校验、全局与会话设置、默认关闭思考、一次生成正文和候选、D1 nullable候选元数据、刷新和UUID回放、候选原文发送与草稿保留已实现。移除固定窗口，通过上游明确context_window、route version、schema、五分钟缓存/CAS与归属明确的超限反馈校正预算，未知能力拒绝推理；16K/32K用例保留当前输入及最近完整问答，按预算裁世界书/旧整轮，不额外摘要调用。

Gateway Read已实证：日志`c09aa204a95e7c5cd4b525557e422d87b6a66f72e32d5d76f664c61165dba2cf`包含三个正确metadata，request/response为空，独立正文接口404/7002。当前RP唯一模型为Workers AI Gemma4，官方API返回context_window=256000，schema支持布尔enable_thinking和Top P/惩罚，未支持Top K；不把成功usage当窗口。仅RP改为零重试/170秒超时并回读，版本2230f986-c794-4ac8-9a0f-a1cbbbf35f01，其他路由保持原配置。沿用用户授权的AgentToken配置服务端能力Secret，不进入浏览器。

隔离本地D1五个迁移通过、聚焦生成/协议/能力检查通过；固定Linux桌面/iPhone WebKit28项流程与82张截图通过，受影响截图已审阅导入；保留三张与本次UI无关的原基线（1/6/24像素差低于既有50容差）。相关核心/协议/能力/生成69项通过，聚焦Worker类型和Svelte0错误/0警告。两次初始视觉失败已分辨为测试中隐藏主题按钮与候选扩展阅读区的212px跟随问题，修复后原≤1px断言通过，未放宽容差。本地真实Worker探针受remote binding/网络超时影响，未计作真实模型验收；生产0005兼容迁移已成功（3条语句，旧记录与ID保留），PR/CI、自动发布和真实模型仍待完成。

## 参数透传与统一UI修订（2026-10-03）

[PR #30](https://github.com/hasbai/financial/pull/30)八项必需检查成功并已发布：main b2ac3a091f17da59380fd8a9c2aad6ebe8ea4c5c；Build 3c78240d-8da2-405c-bdb3-f44158b8bb6c成功；线上version477e0c5a-5782-4b6b-a590-2cde78521358，health200一致。0005候选迁移已兼容应用，旧记录保留。

用户调整RP为本地custom-pc/qwen3.8-27b后，原模型/schema门槛报“模型路由已变更”。按用户要求删除这套准入设计：RP始终可用，参数直接透传；上下文只读探测后台刷新，失败不挡对话。运行时不再访问管理API或依赖管理Token。动态路由Workers binding是唯一推理入口；metadata仍为app/task/真实username，无自动重试。

财务既有Notice提取至packages/ui，财务原入口复用、输出保持一致；Tavern登录、页面和弹层错误及设置保存通知统一引用。AGENTS已记录“禁止过度设计”“尽量复用统一UI”。当前修订相关测试67项通过、Svelte零错误/零警告、聚焦Worker类型检查通过；固定Linux28项流程82张截图通过并审阅导入（2026-10-03T11-46-36.260Z）。保留1/24像素无关渲染差异的原基线。HTML四视图、390px/桌面/深色与16K/32K/unknown交互无错误。架构复核通过；PR/自动部署和真实本地模型验收待完成。

实际本地/apply-template（不执行推理）验证：关闭参数预填充空think块；单独enable_thinking=true会受服务端默认reasoning_effort=none影响报错。显式none/low配合开关后，两种模板均HTTP200，开启预填充开放think。请求指定deepseek解析格式分离思考与可见正文。真实生成仍在发布后验收。
