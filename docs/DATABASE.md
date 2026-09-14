# 数据库与 API

保持 `financial.account`、`financial.transaction`、`financial.entry` 三张基表、全部原字段和 ID。人民币；业务对象均在 financial。前端读取使用 Data API GET，写入仅调用 save_transaction/save_account；金额计算在 SQL，API 金额为十进制字符串。

## 当前报表对象

| 对象 | 粒度与用途 |
| --- | --- |
| balance | 用户维护的物化视图；每科目当前余额，保留原定义与 updated_at |
| balance_history | 物化视图；北京时间自然日 × 科目，保存当日累计余额；从最早有效记录至维护当天，包含无交易日期 |
| balance_read | balance 的受保护读取视图；科目余额、资产、负债、净资产、现金余额字符串 |
| balance_history_read | balance_history 的受保护读取视图；历史月末余额及逐日曲线 |
| cashflow | 用户现有逐笔现金净额视图；transaction_id、occurred_at、net |
| cashflow_read | 读取 cashflow，提供 date、inflow、outflow、net 与用途分类；保留精确时点供半开区间筛选 |
| cashflow_daily | 从 cashflow_read 按北京时间日期汇总流入、流出与净额 |
| income_statement | 现有损益视图；按期间汇总、分类及每日收支 |
| home | 单行首页快照：当前余额、当月损益、待补录数、月度/未来30天现金统计、每日余额及现金图表；不加载交易明细 |
| transactions | 每笔交易及分录、完整性、搜索与筛选字段；按日下钻复用 |
| statement_entries | 完整且状态为 success/refund/partial_refund 的分录；现金流、损益基础 |

不重建已删除的 balance_sheet/cashflow_statement。现金每日统计在完整日期范围可读 cashflow_daily；存在日内截止时点时，对 cashflow_read 先筛选再按 date 做 SQL 聚合，以保持统计与下钻一致。

## 余额及日期

balance_history 与用户的 balance 使用相同纳入规则：只要同笔 transaction 不含 account_id 为 NULL 的分录即纳入，不额外限制状态或借贷平衡。资产/支出为借减贷，其余科目为贷减借。当前 balance 包含所有已录入日期，包括未来日期；历史余额只累计到所选日结束，日历不向未来扩展。两者在存在未来交易时不必相等。

首页当月读取 balance；历史月份读取月末日余额。余额 API 的历史查询是日终快照，不再承诺旧 balance_sheet 的任意日内余额。损益及现金继续精确半开区间。历史未覆盖日期为空；首页不添加口径说明，规则维护在本文及 DOMAIN。

## 刷新维护

`005_balance_history.sql` 首次建立并填充历史物化视图，刷新现有 balance。save_transaction/save_account 在一整笔维护保存完成后调用 refresh_balances，全量刷新两个物化视图；保存、刷新在同一事务，任一步失败全部回滚。回补、改金额、改日期、科目匹配和科目类型修改都会重算全部历史。刷新使用事务 advisory lock 串行化。不创建定时任务或基表触发器。

批量直接维护数据完成后，将 direct connection string 经 stdin 传入 `node scripts/refresh-balances.mjs`，一次性刷新两个对象。脚本不输出凭据。其他外部程序直接改基表不会自动刷新，需在其维护事务后执行此入口；不要仅刷新 balance 而遗漏历史。

## 访问保护

普通读取视图全部 security_invoker。PostgreSQL 物化视图没有 RLS，balance/balance_history 本体不授予 anonymous/authenticated/financial_writer SELECT。两个固定 search_path 的 SECURITY DEFINER 读取函数仅在 is_owner() 的 sub/issuer/audience 全匹配时返回缓存数据；公开包装视图调用它们。客户端不可直接读 MV 或对基表 DML，无法执行维护刷新函数。

save_transaction/save_account 保留原 financial_writer 权限、JWT 判断、固定 search_path、updated_at 冲突检查、金额/借贷校验以及分录 ID 保留。refresh_balances 仅授予 financial_writer 执行，内部再次验证身份。没有新增表、列或多用户结构。

## 请求与验证

Data API 金额聚合使用 `::numeric.sum()::text`；空 SQL 合计映射为字符串 "0"。分组以稳定顺序每1000行分页，科目单日快照先限制 date，不能跨天求和。流水按 occurred_at DESC,id DESC 游标分页；现金下钻 `posted=true&cash=true`，余额下钻 `matched=true`（同笔科目齐全且有分录），不强加旧报表状态过滤。

`scripts/test-database.mjs` 验证原写入/退款/现金损益/权限契约；`scripts/test-balance-database.mjs` 验证日历连续、跨零点、回补刷新、pending差异、远期记录不扩日历和物化缓存隔离；`scripts/test-home-database.mjs` 比对首页与底层报表。数据库测试连接串均从 stdin 输入，测试数据事务回滚。真实 JWT 使用 check-api/check-home-api 单独核验。

迁移必须先在生产副本隔离分支验证，再应用目标数据库。前端发布单独记录；不把源码构建通过当作线上验收。
