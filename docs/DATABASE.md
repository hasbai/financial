# 数据库与 API

仅保留 financial.account、financial.transaction、financial.entry 三张基表及全部原字段、记录、ID。2026-09-15 用户明确：权限使用 Auth0 superadmin 映射数据库角色；页面格式由前端处理。

## 数据读取

- balance：用户维护的当前科目余额物化视图，保留原定义。
- balance_history：已有每日科目累计余额物化视图，前端按日期汇总曲线，按选定日读取月末余额。
- cashflow：用户现有逐笔净现金流，列 transaction_id、occurred_at、net；前端拆分正负流量、按日汇总。分类需要时读取 statement_entries 判断生活、投资、筹资。
- income_statement：已有损益报表，前端汇总期间金额、分类及每日收支。
- transactions / statement_entries：既有流水与有效分录业务视图，保留当前业务纳入规则、筛选和保存返回契约。

006 删除 home、balance_read、balance_history_read、cashflow_read、cashflow_daily 和 read_balance、read_balance_history、overview、get_accounts、transactions_page。不新增页面专用视图，不重建已删除的 balance_sheet/cashflow_statement。历史迁移保留用于追溯，不代表当前应用继续依赖旧对象。

## 权限

Auth0 Post Login Action 将角色写入 Access Token 的顶层 role；Data API 配置 jwt_role_claim_key 为 `.role`，验证 JWT 后切换到 PostgreSQL superadmin。superadmin 是 NOLOGIN/NOSUPERUSER/NOBYPASSRLS 的业务角色，不是 PostgreSQL 超级用户。authenticator 与管理用 neondb_owner 可切换到该角色。

superadmin 具有 financial schema USAGE、三表及现有业务视图 SELECT、save_transaction/save_account EXECUTE；没有基表 DML 或直接刷新权限。anonymous、authenticated 和 PUBLIC 的 financial 访问授权撤销。删除 is_owner、personal_read/personal_write，关闭三表 RLS；不再检查固定 subject，不在前端检查角色。

保存函数继续以 financial_writer 执行，固定 search_path，保留借贷/金额校验、updated_at 冲突、分录 ID 及同笔退款。transaction_detail 仅作保存内部返回助手，refresh_balances 仅作内部刷新，两者都不暴露给 superadmin 执行。

## 金额、日期与刷新

numeric 列在请求中转 text，前端 Decimal 汇总，不经 JavaScript Number 计算业务金额。按稳定唯一顺序每1000行分页；同一报表同时读取时复用进行中的请求。日期采用北京时间，现金及损益使用精确半开区间。当前首页由客户端固定同一 as_of 用于筛选、分组和下钻，多次数据请求不宣称数据库原子快照。

balance 的纳入规则仅排除同笔科目缺失，包含已录入未来交易。balance_history 沿用该规则，按北京时间日末累计至维护当天；存在未来交易时最新历史不必等于当前余额。

保存交易/科目后同一事务调用 refresh_balances，以 advisory lock 串行化刷新两个物化视图；不设 cron 或分录触发器。外部批量维护后经 stdin 将管理连接串传给 node scripts/refresh-balances.mjs，一次性刷新两个对象。

## 验证与切换

scripts/test-database.mjs 验证三表字段、退款、精度、保存回滚、角色授权和现金损益。scripts/test-balance-database.mjs 验证历史连续、北京时间边界、回补、pending 与未来交易。所有测试写入均回滚，连接串只从 stdin 获取。首页前端组装由 API/组件测试及 scripts/check-home-api.mjs 验证；原 test-home-database.mjs 随 home 视图移除。

scripts/check-api.mjs 使用真实 Auth0 PKCE 验证顶层 role、直接读取及网关拒绝；DATA_API_URL 指定目标。check-home-api.mjs 用 VITE_DATA_API_URL 指定已迁移分支。迁移先在生产副本验证，生产数据不由开发副本覆盖；数据库/API、前端部署和浏览器验收分别记录。

生产迁移属于代码交付，隔离验证通过后主动迁移生产并核验 API，再提交推送。main 推送触发前端自动部署，需核验自动构建及线上版本；不额外等待迁移或发布授权。006_role_access.sql 已于2026-09-15应用生产，详见 PROGRESS。
