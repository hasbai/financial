# Tavern 交付状态

2026-10-03。工作树 `feat/tavern`，完整方案见 [TAVERN.md](TAVERN.md)。

## 已实现

- `apps/tavern` Svelte 5 SPA，角色库、发现、世界书、持久对话与设置，复用 Luma、Auth0。
- CCv1/v2/v3 JSON、PNG chara/ccv3、CHARX及独立世界书导入；原文件保留、标准 JSON 导出、未知扩展保留但不执行。
- 关键词/副关键词/常驻/扫描深度/递归/优先级/排序/预算世界书，persona与角色/历史提示组装。
- 独立 D1/R2、JWT superadmin访问、会话快照、生成幂等与锁（锁后读取历史）、原子世界书绑定/删除/分支校验、SSE、部分内容落盘、停止、重新生成、编辑分支、JSONL导出。
- 来源目录固定 TheatreLM revision `eb8597aec4e3e114b2d28b86c3e2496dd48c5af3`，完整 5011 条；原文件SHA256 `6acddc549996246cca97a3bda0560b9fbafe188920703815adeb33d3459b165a`。
- 新 Tavern workflow、应用变更路由、Linux截图生成与导入、visual-coverage清单。

## PR 前验收证据

| 层级 | 状态与证据 |
| --- | --- |
| 本地核心 | 27项测试通过：标准文件/安全边界、世界书、Prompt、SSE、JWT/D1消息/幂等/停止/分支/同步目录 |
| 类型 | Svelte diagnostics 0 errors / 0 warnings |
| 固定 Linux | iPhone WebKit与桌面14项流程通过，68张固定Linux截图已审阅并导入，覆盖5页面/7场景，无豁免 |
| 本地 D1 | 两个迁移实跑，完整目录5011条，source_releases切换成功 |
| 生产资源 | D1 `1652e81e-ce58-4b23-bb24-020928d89546`、私有 R2 `tavern`，迁移已应用；完整目录5011条、固定revision与source_releases已核验 |
| Auth0 配置 | 独立 audience、增量回调、Action `2e74040a-2123-4721-8f4b-c4c3367eaf6c`已部署和绑定；真实专用audience JWT签发、角色搜索/安装/会话保存已验证 |
| Workers Builds | Worker资源 `c4c8bbba63c4436fbaffc7fa2aab63be`，trigger `bbfc0e21-81db-4628-8079-ee4a1ab12a26`，main自动构建已配置，未手动部署版本 |
| 真实模型 | 指定 `dynamic/rp` / `default`，本地远程绑定AI.run internal error、gateway compat 500；官方API已识别dynamic/rp对应模型，但重复探针出现2002执行错误，尚未证明可用内容；待自动部署后真实SSE/停止/恢复验收 |
| PR/线上 | 尚未创建 PR，完整CI、squash合并、自动部署与线上版本待验收 |

Chub/CharaVault探针403；Chub保留来源失败状态及适配器，未声称已验证搜索安装。Risu没有公开搜索契约不接未文档化接口。Dataset Viewer搜索超时/500，改为完整固定版本目录。来源的许可、署名与转换标记随卡片保留。

本地设备模拟不代表真机。合成浏览器夹具在独立dist-e2e，不进入生产dist。尚未完成的层级不得声称已验收。
