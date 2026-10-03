# Tavern 交付状态

2026-10-03。线上入口：[tavern.hasbai.xyz](https://tavern.hasbai.xyz)。完整方案、来源依据与后续路线见 [TAVERN.md](TAVERN.md)。

## 已交付

- `apps/tavern`：角色库、发现、世界书、持久对话和设置，复用 Svelte 5、Luma、Auth0。
- CCv1/v2/v3 JSON、PNG chara/ccv3、CHARX与独立世界书导入；原文件私有保留、原卡与标准 JSON 导出，未知扩展保留但不执行。
- 世界书关键词/副关键词/常驻/扫描深度/递归/优先级/排序/预算，用户 persona、角色、世界设定与历史提示组装。
- D1/R2、JWT superadmin访问、会话快照、生成幂等与锁、SSE、部分内容落盘、停止、重新生成、编辑分支、JSONL导出。
- 完整 TheatreLM 5011 条目录，revision `eb8597aec4e3e114b2d28b86c3e2496dd48c5af3`；worlds.json SHA256 `6acddc549996246cca97a3bda0560b9fbafe188920703815adeb33d3459b165a`。来源、署名、许可和转换标记随角色保存。
- 固定 `AI.run('dynamic/rp', ..., { gateway: { id: 'default' } })`；不接受前端覆盖模型或密钥，无隐式重试或备用模型。

## 验收证据

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
