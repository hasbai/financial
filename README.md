# 北极账本 · Financial

单人个人财务系统：React SPA、Material UI、pnpm。Auth0 北极小站登录，浏览器直连 Neon Data API，Cloudflare Worker `financial` 托管。

目标地址：[financial.hasbai.xyz](https://financial.hasbai.xyz) · 私有仓库：[hasbai/financial](https://github.com/hasbai/financial)

## 功能

- 总览：资产负债、现金流、损益、收支趋势及待补录数量。
- 流水：手机卡片、搜索筛选、分页、新增、补录、科目匹配与分录拆分。
- 退款：在同一个 transaction 内追加反向分录，报表按净额计算。
- 科目：编辑现有字段；“资产 / 现金及等价物”自动识别现金范围。

数据库保持原始 `account`、`transaction`、`entry` 三张表及原字段，没有新增业务表或表字段；视图、函数均在 `financial`，视图不用 `v_` 前缀。

## 本地运行

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm test
pnpm build
```

前端公开配置在 `src/lib/config.ts`。本地 `.env` 仅存程序化验证所需的邮箱/密码，被 Git 忽略，不使用 `VITE_` 前缀，不进入前端构建。

`NODE_USE_ENV_PROXY=1 node scripts/check-api.mjs` 执行程序化 Auth0 登录和生产只读 API 校验；脚本需要已登录的 Auth0 CLI，短暂开启测试所需的 password grant，结束后恢复原配置，不输出 token 或密码。

## 文档

- [完成情况](docs/PROGRESS.md)
- [实施范围](docs/PLAN.md)
- [界面与交互](DESIGN.md)
- [业务口径](docs/DOMAIN.md)
- [数据库与 API](docs/DATABASE.md)
- [接入与发布](docs/ARCHITECTURE.md)
- [原始数据基线](docs/BASELINE.md)
