-- Read models only. No base-table changes or data rewrites.
-- Keep the old read functions for the currently deployed client.
CREATE OR REPLACE VIEW financial.transactions WITH(security_invoker=true) AS
 SELECT t.*,s.entry_count,s.missing_accounts,
 (s.entry_count>=2 AND s.missing_accounts=0 AND s.delta=0 AND s.invalid_amounts=0) complete,
 CASE WHEN s.expense_count>0 THEN abs(s.expense_net-s.income_net)::text WHEN s.income_count>0 THEN abs(s.income_net)::text ELSE s.debit::text END amount,
 CASE WHEN s.expense_count>0 THEN CASE WHEN s.expense_net-s.income_net<0 THEN 'refund' ELSE 'expense' END WHEN s.income_count>0 THEN 'income' ELSE 'transfer' END kind,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'account_id',e.account_id,'direction',e.direction,'amount',e.amount::text) ORDER BY e.id) FROM financial.entry e WHERE e.transaction_id=t.id),'[]') entries,
 lower(concat_ws(' ',t.merchant,t.notes)) search_text,
 coalesce((SELECT array_agg(DISTINCT e.account_id) FILTER(WHERE e.account_id IS NOT NULL) FROM financial.entry e WHERE e.transaction_id=t.id),'{}'::integer[]) account_ids,
 coalesce((SELECT array_agg(DISTINCT a.type::text) FROM financial.entry e JOIN financial.account a ON a.id=e.account_id WHERE e.transaction_id=t.id),'{}'::text[]) account_types,
 (s.entry_count>=2 AND s.missing_accounts=0 AND s.delta=0 AND s.invalid_amounts=0 AND t.status IN ('success','refund','partial_refund') AND
 coalesce((SELECT sum(CASE WHEN e.direction='借' THEN e.amount ELSE -e.amount END) FROM financial.entry e JOIN financial.account a ON a.id=e.account_id WHERE e.transaction_id=t.id AND a.type='资产' AND a.subtype='现金及等价物'),0)<>0) has_cash_flow,
 (NOT(s.entry_count>=2 AND s.missing_accounts=0 AND s.delta=0 AND s.invalid_amounts=0) AND t.status IS DISTINCT FROM 'cancel') needs_review,
 CASE WHEN NOT(s.entry_count>=2 AND s.missing_accounts=0 AND s.delta=0 AND s.invalid_amounts=0) AND t.status IS DISTINCT FROM 'cancel' THEN 1 ELSE 0 END pending_count,
 CASE WHEN s.entry_count=0 AND t.status IS DISTINCT FROM 'cancel' THEN 1 ELSE 0 END missing_entry_count,
 CASE WHEN s.missing_accounts>0 THEN 1 ELSE 0 END missing_account_count,
 CASE WHEN s.entry_count>=2 AND s.missing_accounts=0 AND s.delta=0 AND s.invalid_amounts=0 AND t.status IN ('success','refund','partial_refund') THEN 1 ELSE 0 END posted_count
 FROM financial.transaction t CROSS JOIN LATERAL (
 SELECT count(*)::integer entry_count,count(*) FILTER(WHERE e.account_id IS NULL)::integer missing_accounts,
 count(*) FILTER(WHERE e.amount<=0) invalid_amounts,
 sum(e.amount) FILTER(WHERE direction='借') debit,
 coalesce(sum(CASE WHEN direction='借' THEN e.amount ELSE -e.amount END),0) delta,
 count(*) FILTER(WHERE a.type='支出') expense_count,count(*) FILTER(WHERE a.type='收入') income_count,
 coalesce(sum(CASE WHEN direction='借' THEN e.amount ELSE -e.amount END) FILTER(WHERE a.type='支出'),0) expense_net,
 coalesce(sum(CASE WHEN direction='贷' THEN e.amount ELSE -e.amount END) FILTER(WHERE a.type='收入'),0) income_net
 FROM financial.entry e LEFT JOIN financial.account a ON a.id=e.account_id WHERE transaction_id=t.id) s;

-- Timestamp/account grain preserves arbitrary half-open periods (including intraday).
-- Amounts are text at the boundary; Data API casts to numeric before SQL aggregation.
CREATE VIEW financial.balance_sheet WITH(security_invoker=true) AS
 SELECT occurred_at,account_id,name,type,subtype,
 sum(CASE WHEN type IN ('负债','净资产','收入') THEN -signed_amount ELSE signed_amount END)::text balance,
 coalesce(sum(signed_amount) FILTER(WHERE type='资产'),0)::text assets,
 (-coalesce(sum(signed_amount) FILTER(WHERE type='负债'),0))::text liabilities,
 coalesce(sum(signed_amount) FILTER(WHERE type IN ('资产','负债')),0)::text net_assets,
 coalesce(sum(signed_amount) FILTER(WHERE type='资产' AND subtype='现金及等价物'),0)::text cash_balance
 FROM financial.statement_entries GROUP BY occurred_at,account_id,name,type,subtype;

CREATE VIEW financial.income_statement WITH(security_invoker=true) AS
 SELECT occurred_at,(occurred_at AT TIME ZONE 'Asia/Shanghai')::date date,type,subtype,
 (-coalesce(sum(signed_amount) FILTER(WHERE type='收入'),0))::text income,
 coalesce(sum(signed_amount) FILTER(WHERE type='支出'),0)::text expense,
 (-coalesce(sum(signed_amount) FILTER(WHERE type IN ('收入','支出')),0))::text profit,
 coalesce(sum(CASE WHEN type='收入' THEN -signed_amount WHEN type='支出' THEN signed_amount ELSE 0 END),0)::text amount
 FROM financial.statement_entries GROUP BY occurred_at,type,subtype;

CREATE VIEW financial.cashflow_statement WITH(security_invoker=true) AS
 SELECT transaction_id,occurred_at,category,
 greatest(net,0)::text inflow,greatest(-net,0)::text outflow,net::text net
 FROM financial.cashflow;

REVOKE ALL ON financial.balance_sheet,financial.income_statement,financial.cashflow_statement FROM PUBLIC;
GRANT SELECT ON financial.balance_sheet,financial.income_statement,financial.cashflow_statement TO authenticated,anonymous,financial_writer;
