CREATE FUNCTION financial.overview(p_start timestamptz,p_end timestamptz,p_as_of timestamptz)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 WITH facts AS (SELECT * FROM financial.statement_entries WHERE occurred_at<least(p_as_of,p_end)),
 balances AS (SELECT account_id,name,type,subtype,sum(CASE WHEN type IN ('负债','净资产','收入') THEN -signed_amount ELSE signed_amount END) balance FROM facts GROUP BY account_id,name,type,subtype),
 period AS (SELECT * FROM facts WHERE occurred_at>=p_start),
 flows AS (SELECT * FROM financial.cashflow WHERE occurred_at>=p_start AND occurred_at<least(p_as_of,p_end)),
 totals AS (SELECT coalesce(sum(balance) FILTER(WHERE type='资产'),0) assets,coalesce(sum(balance) FILTER(WHERE type='负债'),0) liabilities FROM balances),
 pnl AS (SELECT -coalesce(sum(signed_amount) FILTER(WHERE type='收入'),0) income,coalesce(sum(signed_amount) FILTER(WHERE type='支出'),0) expense FROM period),
 cash AS (SELECT coalesce(sum(greatest(net,0)),0) inflow,coalesce(sum(greatest(-net,0)),0) outflow FROM flows)
 SELECT jsonb_build_object('as_of',least(p_as_of,p_end),'assets',assets::text,'liabilities',liabilities::text,'net_assets',(assets-liabilities)::text,
 'income',income::text,'expense',expense::text,'profit',(income-expense)::text,'cash_in',inflow::text,'cash_out',outflow::text,'cash_net',(inflow-outflow)::text,
 'cash_opening',(SELECT coalesce(sum(signed_amount),0)::text FROM facts WHERE type='资产' AND subtype='现金及等价物' AND occurred_at<p_start),
 'cash_closing',(SELECT coalesce(sum(signed_amount),0)::text FROM facts WHERE type='资产' AND subtype='现金及等价物'),
 'accounts',coalesce((SELECT jsonb_agg(jsonb_build_object('id',account_id,'name',name,'type',type,'subtype',subtype,'balance',balance::text) ORDER BY type,subtype,name) FROM balances),'[]'),
 'categories',coalesce((SELECT jsonb_agg(jsonb_build_object('name',subtype,'type',type,'amount',value::text) ORDER BY value DESC) FROM (SELECT subtype,type,sum(CASE WHEN type='收入' THEN -signed_amount ELSE signed_amount END) value FROM period WHERE type IN ('收入','支出') GROUP BY subtype,type) c),'[]'),
 'cash_categories',coalesce((SELECT jsonb_agg(jsonb_build_object('name',category,'inflow',i::text,'outflow',o::text)) FROM (SELECT category,sum(greatest(net,0)) i,sum(greatest(-net,0)) o FROM flows GROUP BY category) c),'[]'),
 'trend',coalesce((SELECT jsonb_agg(jsonb_build_object('date',day,'income',i::text,'expense',e::text) ORDER BY day) FROM (SELECT (occurred_at AT TIME ZONE 'Asia/Shanghai')::date AS day,-coalesce(sum(signed_amount) FILTER(WHERE type='收入'),0) i,coalesce(sum(signed_amount) FILTER(WHERE type='支出'),0) e FROM period GROUP BY day) d),'[]'),
 'quality',(SELECT jsonb_build_object('pending',count(*) FILTER(WHERE NOT complete AND status IS DISTINCT FROM 'cancel'),
 'period_pending',count(*) FILTER(WHERE NOT complete AND status IS DISTINCT FROM 'cancel' AND occurred_at>=p_start),
 'missing_entries',count(*) FILTER(WHERE entry_count=0 AND status IS DISTINCT FROM 'cancel'),
 'missing_accounts',count(*) FILTER(WHERE missing_accounts>0),
 'posted',count(*) FILTER(WHERE complete AND status IN ('success','refund','partial_refund')),'coverage_start',min(occurred_at),'generated_at',now()) FROM financial.transactions WHERE occurred_at<least(p_as_of,p_end))) FROM totals,pnl,cash
$$;
REVOKE ALL ON FUNCTION financial.overview(timestamptz,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION financial.overview(timestamptz,timestamptz,timestamptz) TO authenticated,anonymous;
