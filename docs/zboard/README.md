# Zboard 开发入口

`apps/zboard`：Svelte 5 SPA / 共享 Luma neutral / Worker `zboard` / D1。代理节点、用户服务资格、模板、订阅与 Node API；财务三表/Neon 限制不适用。

## 用户确认的边界

- 用户确认引入 monorepo 时未上线、无旧业务数据；首次 Auth0 登录创建禁用用户，管理员启用并分配节点/权限，不实现旧账户关联或自建登录/密码服务。
- 登录共用 `packages/auth`，但必须保留独立 Zboard API audience，授权唯一入口见[AUTHORIZATION](../AUTHORIZATION.md)。email 只展示，不用来关联/授权；面板不授予自身 Auth0 管理员角色。
- 复用原 Worker/D1 资源，不从外部独立仓库运行 seed 或导入旧数据。零流量不写 D1，不在 GET 轮询写心跳，不伪造节点在线状态。
- 服务端配置与订阅公开参数分开，订阅仅序列化白名单，REALITY 等私钥不进入用户订阅，不生成虚假的可用节点。
- 节点实际连通、代理下载规则和真实客户端导入须独立核验，不能用原生配置语法检查替代。

## 按任务读取

| 任务 | 文档与代码入口（源码路径相对应用目录） |
| --- | --- |
| 节点、用户、Node API、订阅及模板规则 | [ARCHITECTURE](ARCHITECTURE.md)；`worker`、`shared/clash-preset.ts` |
| 功能与本地启动 | [应用 README](../../apps/zboard/README.md) |
| 原生 Mihomo、隔离 D1、Linux 截图、PR/CI 与发布 | [共享 TESTING](../TESTING.md)；`visual-coverage.json`、`.github/workflows/zboard.yml`（仓库根） |

数据模型和限额/同步/重试语义以架构为准。沿用 Workers Builds 自动发布，不另建重复部署流水线。
