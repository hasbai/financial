# Tavern Agent：长期方案与七步实施

2026-10-03。目标：有状态、长期记忆、有限工具回合的角色Agent，优先适配32K且prefill/decode慢的本地模型。首批实施第1步；后续逐步验证发布，不将尚不存在的工具塞进提示词。

代码入口为主分支`apps/tavern`。保留现有数据和ID、角色卡、共享认证、候选、流式正文、停止、续写、重新生成、编辑分支和导出。

## 参考结论

口述Tarven暂按SillyTavern研究，尚未确认是否另一个项目。

- [DeepSeek Harness架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)：session、prompt assembly、tools、model adapter、agent loop分工，一个turn可包含多个模型/工具step。采用这些职责划分和可重建请求记录；不引入Cordis插件系统、代码执行或子Agent。
- [SillyTavern提示词](https://docs.sillytavern.app/usage/prompts/)与[角色卡](https://docs.sillytavern.app/usage/core-concepts/characterdesign/)：固定角色定义和可变会话上下文分离。沿用标准卡片，不把标签、作者备注、扩展脚本放进prompt，不复制其全套预设。
- [SillyTavern摘要](https://docs.sillytavern.app/extensions/summarize/)：摘要绑定消息位置，编辑后回到有效版本；摘要有误差，保留原文与来源，避免每轮额外总结。
- [SillyTavern缓存配置](https://docs.sillytavern.app/administration/config-yaml/)与[llama.cpp server](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)：变化前缀会限制缓存复用；`cache_prompt`及实际缓存计数/时序需在部署版本核实。
- [Cloudflare Durable Objects存储](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/)：每对象私有事务存储，新namespace采用SQLite；[并发控制](https://developers.cloudflare.com/durable-objects/api/state/)不能包住长模型请求。

以上为一手文档研究与本项目设计，未安装或逐行复刻参考项目。用户所说的会话对象对应 **Durable Objects**，它不保存本地GPU的KV cache。

## 当前实现与改进

| 已有 | 问题 | 改进 |
| --- | --- | --- |
| Worker一次dynamic/rp + SSE | 无工具续轮 | 无工具快路径+有限loop |
| D1完整消息、UUID、180秒生成lease | 尚无state/summary | 会话DO统一管理回合和版本 |
| 后台/props探测n_ctx | 探测失败过去无限发送历史 | 规划预算独立于发现结果 |
| 每轮倒推滑动历史 | 频繁改变旧前缀 | 固定整轮块、低频checkpoint |
| 世界书关键词注入system | 激活变化会改前缀 | 保留现有功能，RAG后置 |
| 只在最新user副本加格式提醒 | 下一轮该提醒消失 | 首批保留验证过的行为，后续持久模型投影 |

Gateway仍固定`dynamic/rp`，前端不提交任意URL/上游模型/密钥。`skipCache:true`保留，它禁用回复缓存，与模型KV缓存不同。

## 七步执行顺序

首批预算、观测和协议隔离已随PR #36–#38上线，实测见[TAVERN-PROGRESS.md](TAVERN-PROGRESS.md#agent-第一阶段最终交付2026-10-04)。当前32768窗口/1个slot，重复前缀两条请求分别复用422/426 tokens；连续增长三轮仍0命中。因此第1步的后续优先项是定位增长历史与slot缓存行为，再推进DO/state/tools。工具能力元数据可用，真实工具闭环未验收。

| 步骤 | 交付 | 验收 |
| --- | --- | --- |
| **1 短prompt与预算** | 精炼写作规则、保留已验证候选协议、12K常用输入目标、32K规划上限、固定整轮块、请求缓存复用、首正文/usage/cache时序 | 16K/32K/未知、长卡片、最近完整轮次、续写/重生成、自定义保留、同次候选、真实连续轮次 |
| **2 每会话DO** | SQLite DO、用户+会话路由、回合占用/取消/UUID、全部会话接口统一、旧会话惰性导入 | 重启、隔离、并发、重复请求、导入失败、ID/版本保留、停止/分支/删除/导出 |
| **3 state与摘要** | 有界JSON状态、回合前后快照、摘要和总结到的消息版本、阈值压缩 | 成功才提交、重生成恢复前态、分支无未来事实、摘要失败不删原文、短聊不多调模型 |
| **4 最小Agent loop** | search_memory/update_state、工具结果续轮、最多3次请求、共享预算/deadline | 0/1/2工具续轮、原生tools兼容、非法参数、重复调用、循环上限、取消、正文不泄露协议/思考 |
| **5 长记忆检索** | 摘要块+原文锚点、会话内关键词/全文检索；后续再加embedding | 旧事实找回、否定更正、出处、中文召回、当前会话/分支隔离、未命中不伪造 |
| **6 性能与恢复** | 模型投影追加、压缩低水位、有限slot亲和、公平调度、断流恢复 | 长聊/切会话cached tokens和TTFT实测、route变化、取消/重启、不盲目重发 |
| **7 世界书RAG** | 版本化分块、关键词+向量、metadata过滤、有界召回 | 来源/权限、无关条目不注入、召回质量、额外成本/缓存影响 |

第1步的旧历史仍完整保存，但模型可见部分缩短，**不代表已有长期记忆**。第3/5步补齐语义保留和找回。世界书新增RAG后置，不删除现有导入、绑定与关键词功能。

## 最终结构

```mermaid
flowchart LR
  U[用户消息] --> W[Worker验证共享身份]
  W --> S[当前用户与会话DO]
  S --> P[固定规则/卡片 + 摘要/近期消息 + state]
  P --> L[有限Agent loop]
  L --> G[Gateway dynamic/rp]
  G --> M[本地模型与KV cache]
  M --> L
  L --> T[search_memory / update_state]
  T --> S
  L --> R[流式正文与候选]
  R --> C[成功提交消息和state快照]
  C --> S
```

保持直接的TypeScript模块：prompt、model adapter、tools、agent loop、session storage。先不引入通用插件框架或Agents SDK；确有收益再评估。

## 每轮prompt与缓存顺序

逻辑上每次step包含角色卡、state JSON、长期摘要、近期消息、当前输入和实际可执行的工具；按稳定到变化排列：

1. 短system：写作规则、工具规则和候选协议；稳定排序的工具schema。
2. 角色卡、用户persona、卡片额外约束；不重复抄卡片，不自动改用户自定义。
3. 低频摘要checkpoint，不每轮重写。
4. checkpoint后的完整近期消息，平时追加，不重排。
5. 当前state JSON、必要检索结果、当前用户输入；动态内容靠后，最新快照覆盖旧快照。
6. 本回合assistant tool_calls与对应tool results；冻结基础prompt并追加结果，不每step重拼。

JSON紧凑编码、稳定键序；移除模型无关的锁、revision、更新时间和日志字段。state不放在卡片或长历史之前；空摘要显式为空，不伪造记忆。工具返回是数据，不能改变system或权限。

实际chat template可能把tools渲染在system之前，所以检验最终token前缀，不只比较messages数组。持久模型投影应保留实际发过的应用提醒、工具协议和需要的模板内容；首批仍有世界书变化/最新提醒带来的缓存边界限制，不声称全历史缓存命中。

精炼写作规则：保持角色口吻与已发生事实，只写角色可知的信息，用户决定自己的行动和台词；具体对白/动作推进当前场景，不复述灌水或擅自跳时，保留回应空间。段落/长度随情节，不追加长篇禁词表和强制反思。

## 32K与慢模型预算

| 部分 | 初始目标tokens，须按真实tokenizer校准 |
| --- | --- |
| 规则+两个工具 | 约400–700 |
| 卡片+persona | 约1–3K；长自定义不静默改写 |
| state | 约256–768 |
| 摘要 | 约512–1024 |
| 最近消息+当前输入 | 约4–7K |
| 检索结果 | 最多约512–1024 |
| 常用总输入 | 8–12K，首批12288软目标 |
| 整轮总输出 | 用户maxTokens，默认4096，包含思考/工具参数/正文/候选 |
| 模板余量 | 首批512，工具接入后按实际渲染校准 |

首批采用Unicode字符估算和现有1.2倍率；硬输入为`min(用户声明32768, 已发现更小容量) − maxTokens − 512`。未知能力仍对外报告null，不把用户声明冒充探测结果。发现更小容量立即降低；更大容量本阶段仍控制32K。

核心规则/卡片/当前输入与上一完整问答允许超过软目标，仍受硬预算；不切半条输入。按历史起点约2048估算tokens组成完整轮次块，只删除最老整块。短聊保留全部有效历史。长卡片本身超硬预算则生成前明确失败，不隐藏删设定。

后续压缩至约8K低水位，增长至12K再压缩。真实模板/tokenizer优先，但不每轮额外发计数请求。角色或system更新视为新前缀，不用当前时间/随机数/UUID做缓存键。

默认最多3次模型请求：最多2次工具阶段，最后一次禁工具、输出正文；无工具仅1次。不强制规划→反思→润色，不持久重放长思考。模板要求的同回合工具续轮思考有界保留，其他思考不进入下一回合。

一个用户回合共用总输出预算和deadline，不能每step重领4096 tokens或175秒。工具参数/结果单独限长；耗尽按实际终态处理，不伪造成功。保留原有部分正文和显式续写语义。

## 两个简洁工具

| 名称 | 参数 | 描述 | 返回 |
| --- | --- | --- | --- |
| search_memory | query:string | 查本会话相关旧事实。 | 最多3条`id,text,source`短记录 |
| update_state | patch:object | 更新已发生的场景事实。 | 暂存结果`{ok:true}`或短字段错误 |

不提供会话ID/owner参数、SQL、文件或任意URL。执行环境由服务端绑定；不允许跨会话查写。state字段先围绕实际需求选择scene/facts/relationships/inventory，不预建复杂游戏引擎；白名单、深度、总字节和单项长度有界，未提供字段保留，删除语义明确。

原生function calling优先，必须在真实模型/模板完成tools往返。若不支持，暂保留单次生成；文本动作协议须另做结构化输出、完整增量解析和正文隔离验收，不能从普通剧情文字用正则触发更新。不执行角色扩展脚本。工具未闭环前不暴露schema。

## DO与迁移一致性

Worker先验证共享身份/访问权，再按稳定的owner+session组合路由对象；每会话一个DO，避免全局DO。隔离会话数据与回合，不等于隔离共享GPU或为每会话常驻KV。

D1保留角色库、世界书、设置和会话目录，R2保持私有附件。会话正文/版本/state/摘要/tool steps/回合占用最终由DO SQLite统一管理。create/get/generate/stop/update/fork/delete/export一起通过存储入口，不能只迁生成并保留两套锁。

惰性导入旧会话：确认旧生成已结束，读取全部版本/设置，保留ID/ordinal/终态；DO事务导入并核对数量与内容摘要后发布迁移标记。失败保留旧D1真源，不删记录；切换后旧消息只读，禁止双后端同时写。回滚先暂停会话写入并导出新事件，不能回到陈旧D1覆盖历史。

迁移标记/目录和DO无法跨库原子提交，需持久、可重试的完成记录和幂等同步；明确“DO已提交、目录待同步”，不能把目录失败当会话未写入。先在隔离预览验证兼容迁移，再上生产。

短事务领取占用，外部模型await期间允许stop进入；不持有blockConcurrencyWhile。重复requestId回放已有结果，同会话其他请求明确冲突。重启未完成回合可标记中断，不自动重复模型请求。

update_state暂存于本回合并可供工具续轮读取；最终正文正常完成时，与message/快照/revision同DO事务提交。length/取消/断流/工具失败不提交推测状态。重生成从被替换回合前态开始，新成功版本才切选中状态；分支创建新DO，只复制分支点之前的有效state/摘要，不能继承未来剧情。续写保留部分正文，不预提交其未完成叙事状态。

## 摘要与记忆检索

摘要保存确认事件、关系、约定、未决线索和必要时序；state保存当前事实，两者避免重复。记忆带source消息/版本锚点，更正/否定覆盖旧事实，不把推测存成真。

按阈值或场景结束压缩，不每轮独立总结。评估在已有工具step中合并压缩；确到阈值时才允许有界压缩请求，纳入调度/缓存测量。摘要提交与对应块淘汰一起完成；失败不删除原文，下一请求按已验证硬预算处理，不能无声丢事实。

先用会话内关键词/SQLite全文检索，中文分词召回单独验证；模型需要旧细节时才查memory。后续embedding为检索增强，不每轮重嵌入全历史。世界书RAG须具备版本、来源和过滤，有界top-k，不把整本文本塞进system。

## 缓存实测和发布标准

保留Gateway完整payload/eventId/三项metadata、skipCache:true。请求cache_prompt:true本身不是提速证据，llama.cpp本已默认true；Gateway透传、服务slot保留和template决定实际复用。后续slot亲和只针对实际支持的服务，有租约、公平调度和有限容量；不把UUID直接当slot，不为每会话无限保存GPU缓存。

同卡连续至少3轮，再切会话并返回；另测卡片变化、摘要checkpoint、超过12K、重生成和取消。记录估算输入/实际prompt_tokens/cached_tokens、首正文TTFT、模型端首正文、prefill_ms/decode_ms、总耗时。缺字段null，计数不完整不算伪命中率；冷/热标签描述测试序列，只有计数证实实际缓存。Worker既有10%日志采样，验收可结合Gateway完整响应。

首批精简候选协议在真实验收中漏候选，已恢复此前固定协议，保留最新user副本提醒；不为字数少牺牲现有功能。首批不宣称DO/长期记忆/多轮工具已上线。各步区分代码、自动化/固定Linux视觉、真实JWT/API、真实模型/cache、生产发布。默认提示只升级精确匹配已知旧默认，不覆盖自定义。

主代理修改并提交任务文件，默认可见文字变化先生成Linux截图、审阅/import；新子代理推分支/PR等待全部必需状态，包含最新main后squash。核验Workers Builds自动发布SHA与health版本，不重复手动部署。DO/state阶段补隔离存储验证与兼容迁移，不只推前端遗漏数据。
