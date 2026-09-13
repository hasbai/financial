# 数据库与 API

**保持原始三张表与原字段不变。** 没有新增表、额外业务 schema、version、is_active、is_cash_equivalent、cashflows 或其他持久字段。视图和函数全部位于 `financial`，不使用 `v_` 前缀。

## 原表

| 表 | 字段 |
| --- | --- |
| account | id、type、subtype、name、notes |
| transaction | id、occurred_at、created_at、updated_at、status、payment_method、payment_id、notes、merchant |
| entry | id、transaction_id、direction、account_id、amount |

现金科目就是 `account.type='资产' AND account.subtype='现金及等价物'`，现有 7 个。退款使用同一 transaction 内的反向分录，既有独立退款记录保留原状，不根据商户名或金额猜测合并。

## 视图

- `transactions`：卡片和详情所需的分录数组、完整性、缺科目数量、净额。`kind`、`complete` 仅为计算结果，不是新增表字段。
- `statement_entries`：完整且状态为 success/refund/partial_refund 的分录。
- `cashflow`：每笔交易现金借贷净变化及自动用途分类。

视图设置 security_invoker，金额显式输出 text。原 `get_accounts()` 继续保留，新页面直接读取受权限限制的 `account`。

## 函数

| 函数 | 参数与用途 |
| --- | --- |
| transactions_page | p_filters、p_cursor、p_limit；服务器筛选与游标分页 |
| transaction_detail | p_id；交易头及全部分录 |
| overview | p_start、p_end、p_as_of；三表、趋势、完整性 |
| save_transaction | p_id、p_updated_at、p_payload；单事务保存交易及分录 |
| save_account | p_id、p_payload；原有科目字段的新增/修改 |
| is_owner | 根据已验证 JWT 判断本人访问 |

`save_transaction` 使用现有 updated_at 检测编辑冲突，不增加 version。保留提交的原分录 ID，新增 ID 仍由现有 identity 生成。金额必须为正且最多两位小数，非空分录至少两条且借贷平衡；缺科目可保存为待补录。任何一步失败整笔回滚。

没有幂等请求表、审核状态或审计记录。前端保存中禁止重复点击、不自动重试新增；网络响应丢失后要求先核对流水，避免重复新增。

## 必要访问保护

仅用户指定的本人 Auth0 sub 可读写。`is_owner()` 检查 Neon 验签后设置的 PostgREST `request.jwt.claims` 中 sub/iss/aud。没有用户、成员、账本模型。

实测 Auth0 token 不带 role，Neon 使用配置的 anonymous 默认数据库角色。因此 anonymous 和 authenticated 都授予受 RLS 限制的读取/函数权限；无 token 请求在 Neon 被拒，其他身份或 audience 不能读取业务记录。不能把数据库角色名理解为公开数据权限。

写函数由受限 NOLOGIN 数据库角色执行，客户端不能直接改基表。固定 search_path、全限定引用、撤销默认 PUBLIC EXECUTE。所有用户输入都通过参数传递，不能执行自定义 SQL。

迁移文件只创建角色、权限、RLS、视图、函数。测试脚本核对原始列集合，并对测试数据执行事务回滚。生产数据内容和原始 ID 不由迁移修改。
