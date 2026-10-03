# Tavern 交付状态

2026-10-03。线上入口：[tavern.hasbai.xyz](https://tavern.hasbai.xyz)。完整方案、来源依据与后续路线见 [TAVERN.md](TAVERN.md)。

## 已交付

- `apps/tavern`：角色库、发现、世界书、持久对话和设置，复用 Svelte 5、Luma、Auth0。
- CCv1/v2/v3 JSON、PNG chara/ccv3、CHARX与独立世界书导入；原文件私有保留、原卡与标准 JSON 导出，未知扩展保留但不执行。
- 世界书关键词/副关键词/常驻/扫描深度/递归/优先级/排序/预算，用户 persona、角色、世界设定与历史提示组装。
- D1/R2、JWT superadmin访问、会话快照、生成幂等与锁、SSE、部分内容落盘、停止、重新生成、编辑分支、JSONL导出。
- TheatreLM原始5011条，经本轮质量隔离后5002条可用；revision `eb8597aec4e3e114b2d28b86c3e2496dd48c5af3`；worlds.json SHA256 `6acddc549996246cca97a3bda0560b9fbafe188920703815adeb33d3459b165a`。来源、署名、许可和转换标记随角色保存。
- 固定 `AI.gateway('default').run` 调用 `dynamic/rp`（compat/chat/completions）；不接受前端覆盖模型或密钥，无隐式重试或备用模型。

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

该阶段Gateway读取权限返回403，尚未直接核实后台日志；后续权限已补齐，三项metadata与payload禁存核验见下方当前交付。原生binding当前未返回可用event_id，因此按时间和数量核对，不声称逐条requestId精确关联。

## 模型与同次候选首轮实现（2026-10-03，后续简化取代）

共享参数默认值/校验、全局与会话设置、默认关闭思考、一次生成正文和候选、D1 nullable候选元数据、刷新和UUID回放、候选原文发送与草稿保留已实现。移除固定窗口，通过上游明确context_window、route version、schema、五分钟缓存/CAS与归属明确的超限反馈校正预算，未知能力拒绝推理；16K/32K用例保留当前输入及最近完整问答，按预算裁世界书/旧整轮，不额外摘要调用。

Gateway Read已实证：日志`c09aa204a95e7c5cd4b525557e422d87b6a66f72e32d5d76f664c61165dba2cf`包含三个正确metadata，request/response为空，独立正文接口404/7002。当前RP唯一模型为Workers AI Gemma4，官方API返回context_window=256000，schema支持布尔enable_thinking和Top P/惩罚，未支持Top K；不把成功usage当窗口。仅RP改为零重试/170秒超时并回读，版本2230f986-c794-4ac8-9a0f-a1cbbbf35f01，其他路由保持原配置。沿用用户授权的AgentToken配置服务端能力Secret，不进入浏览器。

隔离本地D1五个迁移通过、聚焦生成/协议/能力检查通过；固定Linux桌面/iPhone WebKit28项流程与82张截图通过，受影响截图已审阅导入；保留三张与本次UI无关的原基线（1/6/24像素差低于既有50容差）。相关核心/协议/能力/生成69项通过，聚焦Worker类型和Svelte0错误/0警告。两次初始视觉失败已分辨为测试中隐藏主题按钮与候选扩展阅读区的212px跟随问题，修复后原≤1px断言通过，未放宽容差。本地真实Worker探针受remote binding/网络超时影响，未计作真实模型验收；生产0005兼容迁移已成功（3条语句，旧记录与ID保留），PR/CI、自动发布和真实模型仍待完成。

## 参数透传与统一UI修订（2026-10-03）

[PR #30](https://github.com/hasbai/financial/pull/30)八项必需检查成功并已发布：main b2ac3a091f17da59380fd8a9c2aad6ebe8ea4c5c；Build 3c78240d-8da2-405c-bdb3-f44158b8bb6c成功；线上version477e0c5a-5782-4b6b-a590-2cde78521358，health200一致。0005候选迁移已兼容应用，旧记录保留。

用户调整RP为本地custom-pc/qwen3.8-27b后，原模型/schema门槛报“模型路由已变更”。按用户要求删除这套准入设计：RP始终可用，参数直接透传；上下文只读探测后台刷新，失败不挡对话。运行时不再访问管理API或依赖管理Token。动态路由Workers binding是唯一推理入口；metadata仍为app/task/真实username，无自动重试。

财务既有Notice提取至packages/ui，财务原入口复用、输出保持一致；Tavern登录、页面和弹层错误及设置保存通知统一引用。AGENTS已记录“禁止过度设计”“尽量复用统一UI”。当前修订相关测试67项通过、Svelte零错误/零警告、聚焦Worker类型检查通过；固定Linux28项流程82张截图通过并审阅导入（2026-10-03T11-46-36.260Z）。保留1/24像素无关渲染差异的原基线。HTML四视图、390px/桌面/深色与16K/32K/unknown交互无错误。架构复核通过；PR/自动部署和真实本地模型验收待完成。

实际本地/apply-template（不执行推理）验证：关闭参数预填充空think块；单独enable_thinking=true会受服务端默认reasoning_effort=none影响报错。显式none/low配合开关后，两种模板均HTTP200，开启预填充开放think。请求指定deepseek解析格式分离思考与可见正文。真实生成仍在发布后验收。

## 当前交付验收（2026-10-03）

[PR #31](https://github.com/hasbai/financial/pull/31)八项必需检查全部成功，包含最新main并squash为`ed1180fb066b8f7d43b36b849374122872c87288`。自动Build`31bc671c-936f-4770-a861-b3dc570cbe97`成功且commit_hash一致；deployment`04086369-faa3-4083-b2ac-492cb5623b24`、version`340ea9f6-e895-4e1c-b802-346bb88ef980`流量100%，health200版本一致；无手动部署。

真实JWT应用验收：关闭思考请求`1aeb577a-cfa7-4b85-92f5-704516313304`正常completed/stop，正文9字、3候选；开启请求`dec6ee7c-2a96-4e1e-a2d5-1568556cf81a`正常completed/stop，正文12字、3候选。两轮均0error、刷新候选一致、原UUID回放未重复生成、锁释放。候选原文发送请求`0abe609b-d0ce-4b5a-9cec-187869d3faa0`正常完成、第二条用户消息逐字一致。实际设置包含TopK20、TopP0.9、两项penalty0.1。浏览器夹具已独立验证点击发送、双击保护和草稿保留，未将API探针冒称真实浏览器点击。临时2会话/1角色已删除。

Gateway同一验收时间段恰好3条Tavern日志，HTTP200、模型qwen3.8-27b，均为`{app:"tavern",task:"roleplay",username:"时阅"}`，伪客户端metadata无效，request/response未存正文。日志ID依次为`9656cf39015064612d61351b689b84cba1d2253406470edfbd76672d18a2564a`、`a0d913e828b2d16dd9a7719af1d02501e34a6b066f62fbb585087415ee5a8626`、`cb6842555202ad1377cc1dfea3dc1878f1801d4b0568e72f8e077fc8e4a239a9`，output tokens86/95/308。与实际3次生成数量一致；刷新和回放未产生额外日志。当前原生binding日志event_id为空，按时间及请求数核验，不声称eventId已在后台确认；应用仍发送该选项。

单样本关闭思考首正文18.46秒、正文最后增量18.69秒、候选就绪不晚于总耗时22.68秒；开启首正文6.98秒、总耗时12.18秒。冷启动/预填充缓存状态不同，不能据此比较思考开关延迟或承诺速度。实际模板验证和请求参数、token用量与生成终态分别记录，未把过滤reasoning_content当关闭证明。

上下文自动化验证16K/32K、未知模式及后台刷新/更小明确上限两种并发顺序。实际上游/props曾HTTP200、n_ctx32768且单slot；发布后的应用模型选项仍为contextTokens:null，随后上游/props、/v1/models、/health均HTTP502。因此真实运行时容量发现尚未成功，不把节点侧32K探针当作Worker已发现容量；探测失败不会阻断聊天，保留核心设定、最近完整问答和当前输入，省略世界书及更早历史。上游GET异常原因未定位，接口恢复后后台自动重新探测。应用修复与模型服务当时可用性分开记录。

## 统一Auth0与完整Gateway日志修订（2026-10-03）

用户明确要求北极小站Auth0配置统一，禁止Tavern audience限定，并要求查看完整模型请求。当前修订移除Tavern前端audience覆盖与专属claims，复用packages/auth公共配置、顶层role和公共username；原财务role映射保留，公共名称签发不限制Tavern audience。旧Tavern Action在兼容发布后解绑，setup脚本不再创建独立API或恢复旧Action。

Gateway原payload=false解释了只有metadata没有完整请求；现改为true，保留三项metadata、动态Workers binding与单次调用。上方旧记录中的payload禁存及Tavern专属鉴权均为历史行为；新版本真实JWT及完整请求/回复日志验收已完成。

发布前已先更新既有financial role Action并回读源码一致，原5个绑定顺序保持，旧Tavern Action暂保以兼容当前Worker。普通Universal Login+PKCE签发共享audience JWT、顶层role=superadmin、公共username=时阅，无Tavernclaims；该JWT只读财务Data API HTTP200，原财务映射有效。auth/生成40项及Svelte/聚焦Worker类型检查通过；Linux28流程82截图通过，80张逐像素一致、2张在既有50像素容差内，无有意UI变化、不替换原基线。架构复核通过。

| 层级 | 最终证据 |
| --- | --- |
| PR/CI | [PR #32](https://github.com/hasbai/financial/pull/32)八项必需状态成功，包含最新main并squash为`aa9c77c7c734fd4380fee8291d55447aa71eb230` |
| 自动发布 | Build `f1dad52d-bac7-45ac-b395-ed5f0c61cfc9`成功且commit_hash一致；deployment `2a427dd7-437d-483a-b8f5-cfcdc762249a`，version `dac7a0fe-42db-4001-8646-63c37c17c1e5`流量100%，health200版本一致；无手动部署 |
| 共享认证 | 发布后setup脚本成功，现有共享Action已部署且源码一致；旧Tavern Action解绑后保留signup profile、eastmoney login claims、financial role、zboard role四个既有绑定顺序。新PKCE JWT采用公共配置的既有共享audience，role=superadmin、公共username=时阅，无Tavern专属claim；没有创建新API或逐轮查询管理后台 |
| 真实对话 | 请求`f2ca205e-6a08-4ed3-a2c1-d6be3c40f757`正常completed/stop，正文8字、3候选，约10.73秒；临时会话与角色均删除，角色列表读回本轮探针剩余0 |
| 完整日志 | 日志`b55dec311b5829f30a589e38b9417fedb39c708a4fc6a4bcf60af387be83ab17`，创建时间2026-10-03 20:33:33（Asia/Shanghai），HTTP200，metadata为`{app:"tavern",task:"roleplay",username:"时阅"}` |
| 原始正文 | `/logs/{id}/request`和`/logs/{id}/response`均HTTP200，1193与25289字节，分别与日志记录的request_size/response_size完全一致。完整请求含3条messages及验收输入，Top K20、Top P0.9、关闭思考；完整响应为SSE，包含正文、3候选、stop及`[DONE]`。原始正文仅保存在本地忽略目录，不提交用户内容或Token |

当前Cloudflare日志详情的`request`/`response`摘要字段为空，但`request_head_complete`/`response_head_complete`为true且正文下载接口可读，因此不能仅凭两个摘要字段判断未保存payload。新日志已有完整正文，旧版本禁存payload的日志无法补回。原生binding仍未返回可用event_id，本次通过完整正文中的唯一验收输入和requestId标记核对对应日志，不声称后台event_id已确认。

## 对话界面、完整历史与聚合日志修订（2026-10-03）

按ChatGPT式交互重做：右侧用户气泡、无气泡角色正文，消息姓名与头像隐藏；圆形箭头发送/方块停止，输入框单行起步、自动伸展至200px后滚动，清空后复位；复制、编辑与最新回答的重新生成置于正文末尾。全局与会话System Prompt可编辑并独立恢复默认，默认鼓励3–6段、约300–600字的对白与场景细节；只升级精确匹配旧默认的设置，保留用户自定义提示和现有会话快照。用户提示不再因角色卡自带提示而被省略。

已确认漏最初消息的根因是未知容量分支主动只保留最近完整问答，现移除该截断：未知窗口保留全部有效历史与激活世界书，已知16K/32K才按容量预算裁旧整轮。候选改用固定独占行`[TAVERN_NEXT]`与最多三行文本，不含UUID、不要求模型输出JSON；请求幂等UUID仍只在API/日志关联字段。增量解析支持跨块/CRLF、去空去重、序号容错与2KB尾部上限，候选仍一次生成、原文点击发送。

真实日志对照纠正了首轮“不能聚合”的判断：Eastmoney `01M3EJXA5KKBWYKD2Q0203BR0P`与`01M3DAPMZJA73Q3H7NM5CAV6EY`均request.stream=true、provider custom-codex、path responses、response_content_type text/event-stream，正文接口返回含完整output及streamed_data的聚合JSON；`01M3EVE04H7R116E32YG9VVJ6X`的Workers AI Chat Completions流同样聚合。Tavern原`AI.run`日志为unknown、/run、application/json，原始SSE未聚合。PATCH只支持metadata不是无法聚合的证据。

直接REST动态compat探针`f69b6587-3eda-4e3d-945a-310f99a5aa7f`HTTP200流式正常，日志`01M410889NVV3EGJQ0VYT4HRFV`识别custom-pc并聚合。Wrangler本地/remote代理预览均超时，取消子进程代理后健康检查仍超时，未把该环境故障当模型失败；经官方edge-preview API直达临时预览，免密钥Gateway绑定请求`75fe9f7f-03b6-483c-9a4e-fe4315ab90c2`HTTP200 SSE+[DONE]，日志`01M410S3TTK0XTPTG314V5WQC5`包含正确app/task/username、完整`choices[0].delta.content`与4个streamed_data块，证明该绑定可用。当时待发布的Gateway universal绑定dynamic/rp已由下方PR #33上线，未绕过路由、无推理Secret、无第二次调用。旧Workers AI阶段的失败与上游issue617一致；本轮测试的是当前custom-pc路由。

相关64项测试、Svelte零错误/零警告、聚焦Worker TypeScript检查通过；固定Linux桌面/iPhone WebKit28流程、84截图通过并审阅导入（2026-10-03T13-33-20.986Z），仅28张有意聊天/设置变化和2张新展开输入证据，3张≤50像素无关差异保留旧基线。首轮失败为新增恢复提示按钮造成旧模型重置定位歧义，已明确exact定位，未改UI行为或视觉容差。架构复核通过；PR/CI、自动发布及真实多轮验收待完成。

[PR #33](https://github.com/hasbai/financial/pull/33)已通过八项必需检查并squash为`622cfd494bef51277f8d852fdd8fea09af6eeceb`。自动Build`2baf281f-6720-4fbe-939a-27faa1a753d3`成功且commit_hash一致；deployment`a9d30387-5849-45a1-bd1e-c079fec0158a`、version`dd793d65-c4f1-41e3-85f3-04d860afe0da`流量100%，health200一致；未手动部署。

真实共享JWT两轮正文503/409字、均completed/stop、0error。日志`01M411MKK16P19YQVKCTKN9P8P`和`01M411N3BEJWNW8GASA0Y7ZAKB`均为custom-pc/chat/completions，保存完整聚合正文和streamed_data，metadata为`{app:"tavern",task:"roleplay",username:"时阅"}`，event_id对应各自请求UUID。第二轮完整5条messages保留最初问候与首轮输入。首轮3候选；第二轮模型未输出固定分隔符，0候选，因此继续修正候选指令，不把该轮宣称为候选验收成功。临时1会话/1角色已删除。

## 每轮候选格式修正（2026-10-03）

仅加强固定的System指令：每轮（包括续写、重新生成）必须完成正文和候选两部分，并给出标记加三行候选的静态格式；仍共用输出预算、只请求模型一次，不新增模型调用、伪造候选或解析协议。当前custom-pc动态路由的连续两轮edge-preview日志`01M4127MYRCDQ2B19WTMSQFQAH`与`01M412JKDPH4QTSHNEKDCGZNSJ`，正文523/448字、均3候选，430/341块分别与聚合正文完全一致；第二轮5条messages，首轮System尾部与最终指令逐字一致。日志正文可能晚于条目入库，验收读取等待payload就绪，不因此重复推理。相关56项测试及diff-check通过；该小改自动发布后的真实应用、持久化和回放验收待完成。模型指令遵循仍可能漏尾部，应用不追加第二次推理。

[PR #34](https://github.com/hasbai/financial/pull/34)八项必需检查通过并squash为`f954b2b3e5b7f6cd028eb673c5157e85811499ca`，自动Build`05d05f2d-581a-4512-a28f-827be5a193b8`成功且SHA一致；deployment`e2e4a49b-8911-4d3b-8f85-e1079642db95`、version`79ea20ee-d08a-4649-bab7-8957385bc3e9`流量100%，health200一致。生产两轮436/509字、3/0候选，仍有续轮漏尾部，未把预览成功当作生产稳定性证明。日志`01M4134BJEC1GT6SVDA45ZEDSV`和`01M4134RDEYHQWVWHWXY3YV111`的完整正文均与应用正文及流式拼接一致，三项metadata正确、event_id逐轮匹配，最初消息保留；临时1会话/1角色清理成功。

架构复核指出此前手组预览与生产在角色内容、连续性规则和采样参数上存在差异。最终小改只在模型请求的最后一条user副本末尾追加固定应用格式提醒，先计入预算，三种生成模式共用，用户保存/显示/导出原文不变；System仍固定、历史候选不入Prompt、无额外推理。复用真实失败请求，仅更改提醒后连续三轮5/7/9条messages：日志`01M413GET8A5X0E9DMTJWRAJN8`、`01M413H204D2829Z2N5NP36JP4`、`01M413HFJBGPPEF6DMBJN8W7AG`，正文391/423/537字、均3候选，332/358/396块全部与聚合正文一致。相关68项测试、聚焦Worker类型和diff-check通过；HTML日志路径更新后四视图、1440/390px、深浅主题无溢出或JS错误。最终自动发布及真实应用验收结果如下。

## 最终对话与日志验收（2026-10-03）

| 层级 | 结果 |
| --- | --- |
| PR/CI | [PR #35](https://github.com/hasbai/financial/pull/35)八项必需状态成功、基于最新main，squash为`b11df3b762cf29f00afd01446fa3734219a13608` |
| 自动发布 | Build`6f511ee8-a97e-445c-a133-d0541c2652e0`：push_event/main、build_outcome=success、commit_hash与上述SHA一致。deployment`5380b2ef-9821-4e0f-9285-12a31f94412a`、version`d4003453-7e87-4d64-bf43-e7d2400665e3`流量100%；匿名health200版本一致，无手动部署 |
| 真实两轮 | 共享PKCE/JWT请求`4c02d153-30cf-4b6a-87cb-1a7de3024b58`和`e40f8c1f-da7b-4894-a5a2-e7b2dcf0ab29`，正文354/319字、3/3候选、218/203次delta，均completed/stop、0error；首正文4.51/5.20秒，总耗时12.99/13.37秒，仅为本次样本 |
| 持久化/幂等 | 两轮正文与候选刷新读回一致，用户保存原文不含应用提醒，所有delta拼接等于终态正文；原UUID回放成功、锁释放；同一时间范围恰好两条匹配真实请求的模型日志，无候选补发或回放推理 |
| Gateway日志 | 首轮`01M413Z89CZ8EMDJ32Z3WM89SN`，续轮`01M413ZPHZA5VNWRVHZB69243G`，custom-pc/chat/completions、stream=true、三项metadata=`{app:"tavern",task:"roleplay",username:"时阅"}`，event_id逐轮等于requestId。请求分别3/5条messages，保留最初问候及首轮输入，稳定System不含UUID |
| 完整聚合 | 两条响应均包含完整`choices[0].delta.content`与`streamed_data`，可见正文逐字等于应用保存正文，全部delta拼接等于聚合正文。请求/回复字节分别2407/79582、3568/72675，与Gateway记录精确一致；正文及Token只存本地忽略目录 |
| 清理与局限 | 临时1会话/1角色DELETE成功，读回均404；临时预览公共入口及持久脚本均404。实际`/api/models`容量仍null，不能宣称线上发现32K；未知容量保留全部有效历史与激活世界书，不阻断聊天。模型仍可能不遵守格式，不承诺候选永久必达、不追加第二次推理 |

架构最终复核通过。实现、固定Linux桌面/iPhone WebKit视觉、PR必需CI、自动部署及上述真实JWT/API/模型日志均独立验收；不把设备模拟宣称为真机验收。前面待验收叙述均为相应历史阶段。

## Agent 第一阶段：短提示词与受控预算（2026-10-04）

长期路线见[TAVERN-AGENT-PLAN.md](TAVERN-AGENT-PLAN.md)，首批仅实施第1步，后续DO/state/摘要/工具/世界书RAG尚未上线。当前主目录已切到最新main，酒馆入口为apps/tavern，不再依赖旧工作树定位。

精炼默认写作与同次候选协议，只迁移精确匹配两个已知旧默认的设置，保留用户自定义。模型输入软目标12288、用户声明的32K规划上限，发现更小容量优先；未知能力仍报告null，不使用Infinity发送全历史。保护当前输入和上一完整问答；旧历史按起点约2048估算tokens的完整轮次块裁剪，原文不删除，尚无长期记忆。

显式请求cache_prompt:true、保留Gateway skipCache:true；二者分别为上游KV复用和回复缓存，不将字段存在当缓存成功。日志增加实际prompt/output/cached tokens、prefill/decode时序、生成处理阶段/模型调用阶段首正文耗时，以及分项预算、发现值/规划值和未包含消息数。上游缺指标为null，不编命中率。

83项相关轻量测试、聚焦Worker TypeScript与diff-check通过。架构复核提出的容量来源标记、固定块边界/大轮次覆盖已修正；首次固定Linux截图11流程/68图通过，默认文案2图有意变化。恢复已安装Docker Desktop后使用同一固定镜像，未放宽容差。最终截图导入、PR/CI、自动发布与真实JWT/模型/cache验收仍待完成，后续以最终交付记录为准。

PR #36八项必需状态通过并squash为`cf1dfeb459570a23b0f4999bfa1efb4e649cba18`，自动Build `2d9cfb37-7ce7-4715-9cf7-eaed6c7af715`成功且SHA一致，version `f5ddd817-a7de-40b2-afc9-2cd10e32e7e2`线上health一致。首次真实JWT正文正常stop但0候选，临时2会话/1角色全部删除；因此未作为最终候选验收。后续修正恢复此前验证过的完整固定候选协议，仅保留写作规则精简、分块预算和观测，候选/缓存需在修正自动发布后复验。

PR #37八项必需状态通过并squash为`fe2b7df6ce4241ca3fc5322f52a776432244de5f`，自动Build`c3681dea-cdef-4b7b-91ee-495599670daa`成功且SHA一致，version`b3d70086-079b-4d60-a063-aeebf717234a`线上一致。恢复旧协议后的真实前两轮正文254/227字、3/3候选、持久化和原UUID回放通过；第三轮正文正常stop但候选0。原始日志`01M419GQ3G7YZ4NT30C4NK0DC4`实际输出3条有效短句，分隔符紧接正文缺少前置换行，既有解析器没有进入尾部，故该轮未通过正文隔离验收。

已按原始响应修复默认保留标记的流式容错：同时接受完整换行标记和缺前置换行的标记，仍要求后置换行；完整形式优先，跨chunk不提前泄露协议，自定义marker语义不变。新增所有切分位置、CRLF、标记中断、Worker delta/终态/持久化和单次模型调用测试，65相关测试通过；不再修改提示词、不补发候选推理、不改截图基线。此前3轮真实cache_n均0，保留失败样本，不宣称缓存命中；剩余有限样本在修正版发布后核验新临时会话和重新生成。

## Agent 第一阶段最终交付（2026-10-04）

[PR #38](https://github.com/hasbai/financial/pull/38)八项必需状态通过并squash为`d482ed5c0002d4bcad06966da988b709a1b0ad7d`。自动Build`32db16cc-6f69-49ef-ade3-967c483d3c01`成功，push_event/main与commit_hash一致；deployment`0341a2ae-efc7-4c7b-8f4c-9bd2f7a53e92`、version`9f53f4c9-2994-4f01-8778-19266bfd222a`流量100%。Node原生fetch health200且版本一致，未手动部署；Python urllib同URL一度403，未将它认定为Worker发布失败。当前主目录已回到最新main。

既定6轮样本保留前3轮及第3轮失败记录，不重置抽样。修复后剩余3轮使用新临时会话A/B/A重生成（原前3轮会话已清理，不能声称返回原已删除会话）：正文407/245/382字，全部completed/stop、3候选、无协议泄露、刷新读回一致、原UUID回放一致、锁释放。临时2会话/1角色清理3/3；早先两个探针各2会话/1角色也已全部清理。此次未新增真实续写验收，相关续写预算/解析由自动化覆盖。

| 样本 | Gateway日志 | 输入tokens | cached tokens | 实际新prefill tokens | prefill ms | 客户端首正文ms | 应用总验收ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 4，新A正常 | `01M41AEP4R9TYXMAS0TF8YDH1X` | 426 | 0 | 426 | 700.516 | 3579 | 15194 |
| 5，切至新B | `01M41AF554FNYAB2P91D4B0FB7` | 426 | 422 | 4 | 258.423 | 3338 | 11256 |
| 6，返回新A重生成 | `01M41AFFS161H0MBC7N1Y9WG5Q` | 426 | 422 | 4 | 246.464 | 2461 | 12830 |

三条日志event_id逐轮匹配真实请求，HTTP200、custom-pc/qwen3.8-27b、3条messages、cache_prompt:true、Gateway cached:false和三项metadata正确；完整聚合正文经同一解析器处理后的SHA256与应用正文一致，streamed_data分别345/220/341。原UUID回放无额外模型请求。缓存token同时由usage.prompt_tokens_details.cached_tokens及timings.cache_n证实；应用总验收时间包含持久化读取/回放，不能冒充纯模型耗时。

同卡、相同输入、同开场的后两条请求具有相同模型可见前缀，因此证实当前部署支持实际KV复用；不是仅字段存在。此前连续增长3轮输入426/626/805、cached均0，不能将最后两条重复前缀样本推广为长聊稳定命中，也不承诺统一百分比提速。

只读本地/props当前HTTP200：实际n_ctx32768、total_slots1、model_alias qwen38-27b、build b11200-81bc6b83f；chat_template_caps报告supports_tools/tool_calls/object_arguments/parallel_tool_calls/preserve_reasoning等为true。该元数据不等于真实工具闭环验收，未修改本地推理配置。下一优先项是增长历史缓存/实际slot行为，再接会话DO、state与摘要、有限工具循环。首批仅短写作规则、受控分块预算、缓存请求/观测和候选协议隔离；DO/长期记忆/工具/RAG尚未上线。

## 自动压缩与无硬限续写（2026-10-04）

按最新用户批注修订第一阶段：移除固定32768规划上限、12288输入目标和整块历史丢弃；容量未知时保留全部有效历史，超过已发现容量或明确上游context错误时才摘要较早完整轮次。摘要绑定消息ID/内容指纹，原消息不删除；分支不复制旧摘要，重生成只复用有效来源。摘要自身超限或length按时间顺序拆小输入继续压缩。

移除maxTokens设置/上游max_tokens、整轮175秒deadline和100000字符截断；length在同一请求ID/assistant消息/SSE/候选解析器内自动续写，不设模型请求次数上限。特别长的当前输出仅压缩模型投影中的较早片段，完整正文持续保留。用户停止、断连、无进展和上游故障仍保存部分正文。180秒占用持续续租；所有写入检查当前生成ID，checkpoint写入还检查pending状态，避免长生成被接管或停止后迟到写入。

本地相关98项单元/Worker检查通过，包含64K/未知容量、摘要源失效、摘要自身超限、超过三次length续写、跨请求候选标记、stream context错误、大段新输出、取消摘要、占用接管、终态心跳竞态和超过旧正文字符上限。定向TypeScript检查及diff检查通过。完整CI、固定Linux视觉、真实JWT与生产发布证据随交付补充。DO/state/search_memory/update_state尚待下一阶段；本批不同时迁移会话存储。

### 本批发布与验收证据

- [PR #40](https://github.com/hasbai/financial/pull/40)：同步最新main后的提交`a2954256ee277303082d6e3fd6456a25758add2f`八项必需状态全部成功；Check `37140960323`、Blog `37140960334`、Tavern `37140960328`、Zboard `37140960329`各仅一次统一等待。Squash main为`5604464e2b4da495df7cb163283b4dec0930378a`。
- 固定Linux11流程/68截图通过，审阅/import六张有意变化的设置截图；其余两个24/1像素噪声保留原基线。iPhone WebKit为设备模拟，不算真机验收。交互架构图64K/超限/未知案例检查通过。
- 远程隔离D1 `68cce847-d93a-421e-b113-48c5e34e2126`先应用旧schema、插入固定ID/原文，再应用0006并验证摘要可写、原ID与原文不变；临时库已删除。生产迁移前后均2会话/21消息，新增nullable TEXT summary_json且旧摘要为NULL。原Worker兼容；先迁移再发布。
- 自动Build `2bd0f253-ed42-4745-8be7-a6118dd04a1e`成功，commit_hash与main一致；deployment `d0e97a3e-16a8-4da7-9769-024149fc84a2`、version `7931cada-ae49-45af-a274-f81025631fc8`流量100%，版本反查Build一致，线上health200版本一致。无手动部署。
- 真实JWT复验尚未进入模型阶段：正常Universal Login + PKCE取得令牌后，`GET /api/settings`返回403“无权访问酒馆”；未创建验收角色或会话。只读Auth0检查确认验收账号及组织仍有superadmin，共享Action已改为roles/email/username，现有应用仍读取role与命名空间用户名。用户明确选择保留新字段、另行统一迁移应用鉴权；本批未改Auth0、未放宽权限。新的真实摘要/连续length/cache验收待该迁移后补做，不将98项模拟检查或此前缓存样本冒称本批真实模型通过。
- `/Users/yueshi/src/financial`已回到main并同步远端，稳定代码入口仍为`apps/tavern`。DO/state/工具与世界书RAG按长期方案后续实施。

## 按优先级推进：每会话 DO（2026-10-04）

基于最新main推进；路线改为动态优先级，不固定七步。本批只做SQLite会话DO及真实验收发现的摘要兼容修复，state与工具闭环随后实现。

- 每个签名owner+session对应独立DO；会话快照、设置、完整消息版本、摘要、UUID与生成占用由SQLite统一管理，全部会话接口经同一入口。D1保留目录、角色、世界书与用户设置。
- 旧会话在空闲/到期时先写D1永久generation哨兵冻结旧Worker，再事务导入所有消息/候选/终态/摘要并逐字段核对；失败可重试且保留来源。旧活跃生成仍可通过原pending状态停止，未解除旧占用前不迁移。删除保留tombstone，不能从旧D1重新出现。
- 停止立即取消当前模型；Worker断流显式传递取消，准备阶段取消也持久记录并在claim前检查。没有增加硬轮数、输出预算或整轮运行时限。
- DO记录目录revision与已同步revision，alarm重试D1同步；目录慢不阻塞done或下轮推理。世界书绑定先保留旧+新引用并集，DO提交后才收窄；失败和重启不丢引用保护。
- 真实JWT访问已恢复。35188字符样本正常完成但未超限，不能当摘要验收。100152字符样本上游报70234tokens超过32768；旧摘要assistant-last导致角色续写，回送25040字符源文本、仅2个新输出tokens，未形成有效checkpoint。摘要已改成system规则+user来源数据，角色标记保留，待自动发布后复验。
- 109项Node核心/Worker测试与Svelte诊断0错误/0警告；真实workerd SQLite隔离harness验证导入/fence、跨用户/会话隔离、流式候选、回放、分支、停止、跨实例数据恢复、未完成回合恢复、删除不复活。runtime模型为夹具，不能算生产推理通过。已加入Tavern CI。
- 固定Linux28流程/84截图通过，4张原始像素差1/24/27/62均无UI修改，未替换基线；62像素的中断场景另以原50容差严格比较通过。桌面/iPhone WebKit为设备模拟。
- 远程隔离D1 `a2798176-f09d-430b-a47b-33c46e02951d`验证0007、原ID/摘要/候选/正文与旧写入fence，已删除。生产迁移前后均2会话/26消息，均仍legacy，只新增storage_backend/deleted_at；实际访问后才惰性迁移。

PR、Workers Builds与生产DO/模型验收待发布后补齐；不把本地夹具测试当真实模型/cache证据。
