# 北极小站授权规则

2026-10-04。登录统一使用 `packages/auth`、`auth.hasbai.xyz` 与已有北极小站组织。Auth0 负责权限签发；接口验证用户 JWT 后判断对应 `permissions`。普通用户无需 Auth0 `authenticated` 角色。

## 应用与接口边界

| 应用 | 匿名 | 普通登录用户 | Super Admin | 权限与执行点 |
| --- | --- | --- | --- | --- |
| 博客 | 读取已发布且发布时间已到的文章、手记、独立页面、图片 | 同公开读取范围，无编辑权限 | 编辑、发布、删除及上传图片 | `manage:blog`：编辑室与编辑请求；Data API 的 GRANT/RLS 和图片上传真实写入授权继续执行 |
| 北极账本 | 无财务数据访问 | 无财务访问 | 全部财务功能 | `access:financial`：应用入口及数据请求；Data API 继续使用标量 `role=superadmin` 和原 schema/对象 GRANT |
| 酒馆 | 无私有数据访问或对话 | 搜卡、安装/导入、编辑/删除本人卡片和世界书、本人会话及对话、本人设置、服务端白名单模型选择 | 同本人功能；全站敏感操作仅管理员 | 现有 `/api/characters`、`discover`、`install`、`worldbooks`、`sessions`、`settings`、`models` 验证用户 JWT，以 `sub` 隔离本人数据；`manage:tavern` 为全站管理边界 |
| Zboard | 无账户访问；随机订阅凭据与 Node token 为独立协议 | `/api/me`、`/api/me/rotate`；首次登录仍默认禁用，启用、节点、配额、有效期控制服务资格 | `/api/admin/**` 用户、节点、模板、配额及报告管理 | `manage:zboard`：Worker 验证 JWT 后判断管理员；订阅资格及 Node API 机制保留 |

用户确认酒馆“敏感操作”为全站模型/网关配置、公共目录同步、查看或处理他人数据。当前没有对应的全站 HTTP 管理接口：模型/网关配置和目录同步由服务端配置及运维脚本控制，所有现有业务接口仍限定本人资源；Super Admin 也不能通过本人接口绕过 owner 读取他人数据。`manage:tavern` 不代表当前已提供全站管理功能；新增全站接口时必须在执行点强制检查该权限。普通用户模型选择仅接受服务端白名单逻辑 ID，不开放任意模型、URL 或密钥。

## 已有 Auth0 API 与权限

| API | audience | 使用情况 | RBAC | Access Token 权限 |
| --- | --- | --- | --- | --- |
| financial | `https://financial.hasbai.xyz/api` | 财务、博客、酒馆共用 | 已开启 | `access:financial`、`manage:blog`、`manage:tavern` |
| Zboard API | `https://zboard.hasbai.xyz/api` | 独立 Zboard | 已开启 | `manage:zboard` |
| Tavern API | `https://tavern.hasbai.xyz/api` | 历史保留，当前酒馆不请求该 audience | 已开启 | 当前未定义权限，声明为空 |
| eastmoney gateway | `https://eastmoney.hasbai.xyz/` | 其他业务，保留现有权限和分配 | 已开启 | 原有 61 项权限，随原角色分配签发 |
| Auth0 Management API | 租户 `/api/v2/` | Auth0 系统管理 | 系统 API 保留 | 不向业务用户扩大 Management API 授权 |

四个自定义 API 均使用 `enforce_policies=true` 与 `access_token_authz`。Auth0 原生生成当前 audience 下全部已授予的 `permissions`，不由 Action 手工拼接，不要求 SPA 逐项请求 scope。上述四项新增权限仅授予已有 tenant `superadmin` 角色，原角色、组织成员和东方财富 61 项定义不修改。旧 Access Token 不会被重写；重新登录或令牌到期后取得新声明，应用不以 `_roles` 回退管理员授权。

租户现有 `authenticated` 为东方财富组织角色，包含原内测权限，不能作为北极小站新用户默认角色。顶层 `role=authenticated` 是 Neon 数据库角色字符串，不等于授予 Auth0 同名角色。`_roles` 继续保留兼容；财务/博客 Data API 的数据库 `role`、GRANT/RLS 不能由前端 `permissions` 替代。无数据库迁移、无新增表或字段。

服务端仍验证签名、issuer、audience、有效期和用户 sub，并拒绝机器令牌。仅携带一个字符串 Token 不算登录。前端 SDK 令牌解码只控制 UI；Neon/Worker 是实际授权边界，不增加 financial 的 subject/issuer/audience SQL 重复校验。

## 配置与核验

主代理运行 `node scripts/setup-auth0-rbac.mjs` 只读查看，明确授权后运行 `node scripts/setup-auth0-rbac.mjs --apply`。脚本保留原 scopes，追加应用权限，更新已有自定义 API，并回读验证 API 与 superadmin 分配；不输出凭据、不创建新角色/API、不修改登录连接、其他角色或系统 Management API。

真实 JWT/API、本地相关单元、Linux 视觉、CI 与自动部署分别记录。普通用户不改变生产角色来模拟；负向 JWT 与 owner 隔离由签名测试/接口夹具验证，真实普通用户登录须独立核验。
