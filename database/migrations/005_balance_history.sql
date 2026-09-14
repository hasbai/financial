-- Adopt the user-maintained balance materialized view without replacing its definition.
-- Daily closing balances use exactly the same eligibility and normal balance signs.
CREATE MATERIALIZED VIEW IF NOT EXISTS financial.balance AS
SELECT a.id,a.type,a.subtype,a.name,
 sum(e.amount * CASE e.direction WHEN '借' THEN 1 ELSE -1 END
 * CASE WHEN a.type IN ('资产','支出') THEN 1 ELSE -1 END) balance,now() updated_at
FROM financial.entry e LEFT JOIN financial.account a ON e.account_id=a.id
WHERE NOT EXISTS(SELECT 1 FROM financial.entry bad WHERE bad.transaction_id=e.transaction_id AND bad.account_id IS NULL)
GROUP BY a.id,a.type,a.subtype,a.name ORDER BY a.id;
CREATE MATERIALIZED VIEW financial.balance_history AS
WITH changes AS (
 SELECT (t.occurred_at AT TIME ZONE 'Asia/Shanghai')::date date,a.id,a.type,a.subtype,a.name,
 sum(e.amount * CASE e.direction WHEN '借' THEN 1 ELSE -1 END
 * CASE WHEN a.type IN ('资产','支出') THEN 1 ELSE -1 END) delta
 FROM financial.entry e JOIN financial.transaction t ON t.id=e.transaction_id
 JOIN financial.account a ON a.id=e.account_id
 WHERE NOT EXISTS (SELECT 1 FROM financial.entry bad WHERE bad.transaction_id=e.transaction_id AND bad.account_id IS NULL)
 GROUP BY 1,a.id,a.type,a.subtype,a.name
), days AS (
 SELECT day::date date FROM generate_series(
 (SELECT min(date)::timestamp FROM changes),
 (current_timestamp AT TIME ZONE 'Asia/Shanghai')::date::timestamp,
 interval '1 day') day
), accounts AS (SELECT DISTINCT id,type,subtype,name FROM changes)
SELECT d.date,a.id,a.type,a.subtype,a.name,
 sum(coalesce(c.delta,0)) OVER (PARTITION BY a.id ORDER BY d.date ROWS UNBOUNDED PRECEDING) balance,
 current_timestamp updated_at
FROM days d CROSS JOIN accounts a LEFT JOIN changes c ON c.date=d.date AND c.id=a.id;
CREATE UNIQUE INDEX balance_history_date_account ON financial.balance_history(date,id);
REVOKE ALL ON financial.balance,financial.balance_history FROM PUBLIC,anonymous,authenticated,financial_writer;

-- Materialized views do not support RLS. Only guarded, fixed-path readers may expose them.
CREATE FUNCTION financial.read_balance() RETURNS SETOF financial.balance
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT * FROM financial.balance WHERE financial.is_owner()
$$;
CREATE FUNCTION financial.read_balance_history() RETURNS SETOF financial.balance_history
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT * FROM financial.balance_history WHERE financial.is_owner()
$$;
REVOKE ALL ON FUNCTION financial.read_balance(),financial.read_balance_history() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION financial.read_balance(),financial.read_balance_history() TO anonymous,authenticated,financial_writer;
CREATE VIEW financial.balance_read WITH (security_invoker=true) AS
SELECT id,type,subtype,name,balance::text,updated_at,
 CASE WHEN type='资产' THEN balance ELSE 0 END::text assets,
 CASE WHEN type='负债' THEN balance ELSE 0 END::text liabilities,
 CASE WHEN type='资产' THEN balance WHEN type='负债' THEN -balance ELSE 0 END::text net_assets,
 CASE WHEN type='资产' AND subtype='现金及等价物' THEN balance ELSE 0 END::text cash_balance
FROM financial.read_balance();
CREATE VIEW financial.balance_history_read WITH (security_invoker=true) AS
SELECT date,id,type,subtype,name,balance::text,updated_at,
 CASE WHEN type='资产' THEN balance ELSE 0 END::text assets,
 CASE WHEN type='负债' THEN balance ELSE 0 END::text liabilities,
 CASE WHEN type='资产' THEN balance WHEN type='负债' THEN -balance ELSE 0 END::text net_assets,
 CASE WHEN type='资产' AND subtype='现金及等价物' THEN balance ELSE 0 END::text cash_balance
FROM financial.read_balance_history();

-- Preserve cashflow's transaction grain for exact period filters and drilldown.
CREATE VIEW financial.cashflow_read WITH (security_invoker=true) AS
SELECT c.transaction_id,c.occurred_at,(c.occurred_at AT TIME ZONE 'Asia/Shanghai')::date date,
 greatest(c.net,0)::text inflow,greatest(-c.net,0)::text outflow,c.net::text,
 CASE WHEN EXISTS(SELECT 1 FROM financial.statement_entries e WHERE e.transaction_id=c.transaction_id AND e.type IN ('收入','支出')) THEN '生活'
 WHEN EXISTS(SELECT 1 FROM financial.statement_entries e WHERE e.transaction_id=c.transaction_id AND e.type='资产' AND e.subtype<>'现金及等价物') THEN '投资' ELSE '筹资' END category
FROM financial.cashflow c;
CREATE VIEW financial.cashflow_daily WITH (security_invoker=true) AS
SELECT date,sum(inflow::numeric)::text inflow,sum(outflow::numeric)::text outflow,sum(net::numeric)::text net
FROM financial.cashflow_read GROUP BY date;

-- Explicit maintenance entry point; no cron, table trigger, or per-entry refresh.
CREATE FUNCTION financial.refresh_balances() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT financial.is_owner() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(746391025);
 REFRESH MATERIALIZED VIEW financial.balance;
 REFRESH MATERIALIZED VIEW financial.balance_history;
END $$;
REVOKE ALL ON FUNCTION financial.refresh_balances() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION financial.refresh_balances() TO financial_writer;

-- Refresh once after each complete application maintenance operation.
DO $migration$
DECLARE signature regprocedure; definition text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['financial.save_transaction(integer,timestamp with time zone,jsonb)'::regprocedure,'financial.save_account(integer,jsonb)'::regprocedure] LOOP
  definition := pg_get_functiondef(signature);
  IF position('PERFORM financial.refresh_balances();' IN definition)=0 THEN
   definition := replace(definition,'RETURN financial.transaction_detail(tid);','PERFORM financial.refresh_balances(); RETURN financial.transaction_detail(tid);');
   definition := replace(definition,'RETURN to_jsonb(a);','PERFORM financial.refresh_balances(); RETURN to_jsonb(a);');
   EXECUTE definition;
  END IF;
 END LOOP;
END $migration$;
DO $compatibility$
DECLARE definition text;
BEGIN
 definition := pg_get_functiondef('financial.overview(timestamp with time zone,timestamp with time zone,timestamp with time zone)'::regprocedure);
 definition := replace(definition,'SELECT * FROM financial.cashflow WHERE','SELECT *,net::numeric AS cash_net_numeric FROM financial.cashflow_read WHERE');
 -- The legacy function performs arithmetic on net; retain numeric at its CTE boundary.
 definition := replace(definition,'SELECT *,net::numeric AS cash_net_numeric FROM financial.cashflow_read WHERE','SELECT transaction_id,occurred_at,net::numeric net,category FROM financial.cashflow_read WHERE');
 EXECUTE definition;
END $compatibility$;
GRANT SELECT ON financial.balance_read,financial.balance_history_read,financial.cashflow_read,financial.cashflow_daily TO anonymous,authenticated,financial_writer;
REVOKE ALL ON financial.balance_read,financial.balance_history_read,financial.cashflow_read,financial.cashflow_daily FROM PUBLIC;
REFRESH MATERIALIZED VIEW financial.balance;

DROP VIEW IF EXISTS financial.home;
CREATE VIEW financial.home WITH (security_invoker=true) AS
WITH bounds AS (
 SELECT date_trunc('milliseconds',current_timestamp) as_of,
 date_trunc('month',current_timestamp AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai' start
 WHERE financial.is_owner()
)
SELECT b.as_of,b.start,b.as_of+interval '720 hours' future_end,
 (SELECT coalesce(sum(assets::numeric),0)::text FROM financial.balance_read) assets,
 (SELECT coalesce(sum(liabilities::numeric),0)::text FROM financial.balance_read) liabilities,
 (SELECT coalesce(sum(net_assets::numeric),0)::text FROM financial.balance_read) net_assets,
 (SELECT coalesce(sum(income::numeric),0)::text FROM financial.income_statement WHERE occurred_at>=b.start AND occurred_at<b.as_of) income,
 (SELECT coalesce(sum(expense::numeric),0)::text FROM financial.income_statement WHERE occurred_at>=b.start AND occurred_at<b.as_of) expense,
 (SELECT coalesce(sum(profit::numeric),0)::text FROM financial.income_statement WHERE occurred_at>=b.start AND occurred_at<b.as_of) profit,
 (SELECT count(*)::integer FROM financial.transactions WHERE needs_review AND occurred_at<b.as_of) pending,
 EXISTS(SELECT 1 FROM financial.account WHERE type='资产' AND subtype='现金及等价物') cash_configured,
 (SELECT jsonb_build_object('cash_in',coalesce(sum(inflow::numeric),0)::text,'cash_out',coalesce(sum(outflow::numeric),0)::text,'cash_net',coalesce(sum(net::numeric),0)::text)
 FROM financial.cashflow_read WHERE occurred_at>=b.as_of AND occurred_at<b.as_of+interval '720 hours') cash,
 (SELECT coalesce(jsonb_agg(value ORDER BY date),'[]') FROM (
 SELECT date,sum(net_assets::numeric)::text value FROM financial.balance_history_read
 WHERE date>=(b.start AT TIME ZONE 'Asia/Shanghai')::date AND date<=(b.as_of AT TIME ZONE 'Asia/Shanghai')::date GROUP BY date) h) balance_trend,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('start',greatest(date::timestamp AT TIME ZONE 'Asia/Shanghai',b.as_of),'end',least((date+1)::timestamp AT TIME ZONE 'Asia/Shanghai',b.as_of+interval '720 hours'),'inflow',inflow,'outflow',outflow) ORDER BY date),'[]')
 FROM (SELECT date,sum(inflow::numeric)::text inflow,sum(outflow::numeric)::text outflow FROM financial.cashflow_read WHERE occurred_at>=b.as_of AND occurred_at<b.as_of+interval '720 hours' GROUP BY date) c) cash_bars,
 (SELECT jsonb_build_object('cash_in',coalesce(sum(inflow::numeric),0)::text,'cash_out',coalesce(sum(outflow::numeric),0)::text,'cash_net',coalesce(sum(net::numeric),0)::text)
 FROM financial.cashflow_read WHERE occurred_at>=b.start AND occurred_at<b.as_of) month_cash,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('start',greatest(date::timestamp AT TIME ZONE 'Asia/Shanghai',b.start),'end',least((date+1)::timestamp AT TIME ZONE 'Asia/Shanghai',b.as_of),'inflow',inflow,'outflow',outflow) ORDER BY date),'[]')
 FROM (SELECT date,sum(inflow::numeric)::text inflow,sum(outflow::numeric)::text outflow FROM financial.cashflow_read WHERE occurred_at>=b.start AND occurred_at<b.as_of GROUP BY date) c) month_cash_bars,
 '[]'::jsonb recent
FROM bounds b;
REVOKE ALL ON financial.home FROM PUBLIC;
GRANT SELECT ON financial.home TO anonymous,authenticated,financial_writer;
NOTIFY pgrst,'reload schema';
