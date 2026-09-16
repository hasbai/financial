# 北极账本 · Financial

单人个人财务系统：Svelte 5 SPA、Bits UI、shadcn-svelte（preset `b6sUj31yy`）、Tailwind CSS 4、Lucide、pnpm。Auth0 北极小站登录，浏览器直连 Neon Data API，Cloudflare Worker `financial` 托管。

目标地址：[financial.hasbai.xyz](https://financial.hasbai.xyz) · 公开仓库：[hasbai/financial](https://github.com/hasbai/financial)

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
```

自动化验收统一在GitHub CI运行，本地不跑测试或构建验收。每次改完并提交后，由子代理推送功能分支、跟踪单元测试和浏览器集成测试；两项必需检查均成功后通过PR合并。main已启用强制保护，管理员不能绕过。视觉基线及详细交付流程见[测试规范](docs/TESTING.md)。

前端公开配置在 `src/lib/config.ts`。本地 `.env` 仅存程序化验证所需的邮箱/密码，被 Git 忽略，不使用 `VITE_` 前缀，不进入前端构建。

真实JWT/API的专项核验方式见[接入与发布](docs/ARCHITECTURE.md)，不属于CI合成数据浏览器测试，也不向GitHub上传本地凭据。

## 文档

- [完成情况](docs/PROGRESS.md)
- [实施范围](docs/PLAN.md)
- [界面与交互](DESIGN.md)
- [业务口径](docs/DOMAIN.md)
- [数据库与 API](docs/DATABASE.md)
- [接入与发布](docs/ARCHITECTURE.md)
- [原始数据基线](docs/BASELINE.md)
