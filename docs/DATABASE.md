# 数据库与 API

**保持原始三张表与原字段不变。** 没有新增表、额外业务 schema、version、is_active、is_cash_equivalent、cashflows 或其他持久字段。视图和函数全部位于 `financial`，不使用 `v_` 前缀。

## 原表

| 表 | 字段 |
| --- | --- |
| account | id、type、subtype、name、notes |
| transaction | id、occurred_at、created_at、updated_at、status、payment_method、payment_id、notes、merchant |
| entry | id、transaction_id、direction、account_id、amount |

现金科目就是 `account.type='资产' AND account.subtype='现金及等价物'`，现有 7 个。退款使用同一 transaction 内的反向分录，既有独立退款记录保留原状，不根据商户名或金额猜测合并。

## 查询视图

前端查询统一使用 Data API 的 `GET /<view>`，不调用查询 RPC。所有视图设置 `security_invoker=true`，金额字段为十进制 text。筛选后通过 Data API 的 `::numeric.sum()::text` 在 PostgreSQL 内聚合，前端只组合结果、排列类别和展示，不累计借贷或计算报表净额。

| 视图 | 粒度与用途 |
| --- | --- |
| `transactions` | 每笔交易一行；交易头、分录数组、完整性、净额，以及筛选用科目 ID/类型数组、现金变化标记、搜索文本和质量计数 |
| `balance_sheet` | 发生时点 × 科目；包含余额变动、资产、负债、净资产和现金余额变动；筛选 `occurred_at < 截止时点` 后求和，得到截止余额 |
| `income_statement` | 发生时点 × 科目类型 × 子类；收入、支出、净收益、类别金额，以及北京时间日期；筛选期间后汇总或按类别/日分组 |
| `cashflow_statement` | 每笔可入报表交易一行；现金流入、流出、净额及用途分类；筛选期间后汇总或按类别分组 |
| `statement_entries` | 内部基础视图：完整且状态为 success/refund/partial_refund 的分录 |
| `cashflow` | 内部基础视图：每笔交易现金净变化及自动用途分类 |

报表视图保留发生时点粒度，不固定成整月数据，也不读取请求头中的隐式日期参数。资产负债累计、期间损益、未来30天及每6天分组均可使用同一视图；空聚合的 SQL NULL 由 Repository 映射为十进制字符串 `"0"`，空明细仍是空数组。

查询示例（请求头 `Accept-Profile: financial` 并携带本人 Access Token）：

```text
GET /balance_sheet?select=assets:assets::numeric.sum()::text,liabilities:liabilities::numeric.sum()::text,net_assets:net_assets::numeric.sum()::text&occurred_at=lt.2026-10-01T00:00:00%2B08:00
GET /income_statement?select=date,income:income::numeric.sum()::text,expense:expense::numeric.sum()::text&occurred_at=gte.2026-09-01T00:00:00%2B08:00&occurred_at=lt.2026-10-01T00:00:00%2B08:00&order=date.asc
GET /cashflow_statement?select=name:category,inflow:inflow::numeric.sum()::text,outflow:outflow::numeric.sum()::text&occurred_at=gte.2026-09-01T00:00:00%2B08:00&occurred_at=lt.2026-10-01T00:00:00%2B08:00
GET /transactions?select=id,occurred_at,merchant,amount,entries&order=occurred_at.desc,id.desc&limit=31
```

Neon Data API 当前启用了 `db_aggregates_enabled=true`，最大返回1000行。聚合在分页之前执行；报表分组按稳定顺序每1000行继续读取，避免长期日趋势被截断。流水以 `occurred_at DESC,id DESC` 排序，一次取31行显示30行并判断下一页，保留原时间戳精度。搜索使用转义的 `imatch` 正则表达式实现字面子串匹配；科目数组、完整性和现金流标记均直接筛选视图。[PostgREST 聚合、分组和类型转换](https://postgrest.org/en/latest/references/api/aggregate_functions.html)

总览 Repository 组合10个并发 GET（余额合计、科目余额、损益合计、类别、日趋势、现金合计、现金类别、期初现金、累计质量和期间待补录）。这些请求分别读取数据库快照；单人保存后统一失效重查，任一查询失败整张总览报错。`quality.generated_at` 为客户端组合完成时间，不作为数据库快照时间。净资产曲线每个时点只读一次余额合计；现金流合计/分组也只查现金流视图。

## 写入与兼容函数

| 函数 | 参数与用途 |
| --- | --- |
| save_transaction | p_id、p_updated_at、p_payload；单事务保存交易及分录 |
| save_account | p_id、p_payload；原有科目字段的新增/修改 |
| is_owner | 根据已验证 JWT 判断本人访问，供 RLS 和写入函数使用 |

前端 RPC 仅保留两个保存操作。`transactions_page`、`transaction_detail`、`overview` 和原 `get_accounts()` 暂留给已部署旧客户端及回归对照；`save_transaction` 内部仍复用 `transaction_detail` 返回保存结果。本次不删除兼容函数、不改变旧客户端权限。科目列表沿用受 RLS 限制的 `account` 读取。

`save_transaction` 使用现有 updated_at 检测编辑冲突，不增加 version。保留提交的原分录 ID，新增 ID 仍由现有 identity 生成。金额必须为正且最多两位小数，非空分录至少两条且借贷平衡；缺科目可保存为待补录。任何一步失败整笔回滚。

没有幂等请求表、审核状态或审计记录。前端保存中禁止重复点击、不自动重试新增；网络响应丢失后要求先核对流水，避免重复新增。

## 必要访问保护

仅用户指定的本人 Auth0 sub 可读写。`is_owner()` 检查 Neon 验签后设置的 PostgREST `request.jwt.claims` 中 sub/iss/aud。没有用户、成员、账本模型。

实测 Auth0 token 不带 role，Neon 使用配置的 anonymous 默认数据库角色。因此 anonymous 和 authenticated 都授予受 RLS 限制的读取/函数权限；无 token 请求在 Neon 被拒，其他身份或 audience 不能读取业务记录。不能把数据库角色名理解为公开数据权限。

写函数由受限 NOLOGIN 数据库角色执行，客户端不能直接改基表。固定 search_path、全限定引用、撤销默认 PUBLIC EXECUTE。所有用户输入都通过参数传递，不能执行自定义 SQL。

迁移文件只创建角色、权限、RLS、视图、函数。测试脚本核对原始列集合，并对测试数据执行事务回滚。生产数据内容和原始 ID 不由迁移修改。
