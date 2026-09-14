-- One current-home snapshot, one statement, no base-table changes.
-- security_invoker retains the caller's existing subject/issuer/audience RLS.
CREATE VIEW financial.home WITH (security_invoker=true) AS
WITH bounds AS MATERIALIZED (
  SELECT date_trunc('milliseconds',current_timestamp) as_of,
    date_trunc('month',current_timestamp AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai' start
  WHERE financial.is_owner()
), entries AS MATERIALIZED (
  SELECT occurred_at,type,subtype,signed_amount FROM financial.statement_entries
), future_cash AS MATERIALIZED (
  SELECT c.occurred_at,c.net FROM financial.cashflow c CROSS JOIN bounds b
  WHERE c.occurred_at>=b.as_of AND c.occurred_at<b.as_of+interval '720 hours'
)
SELECT b.as_of,b.start,b.as_of+interval '720 hours' future_end,
  totals.assets,totals.liabilities,totals.net_assets,
  totals.income,totals.expense,totals.profit,
  (SELECT count(*)::integer FROM financial.transactions t WHERE t.needs_review AND t.occurred_at<b.as_of) pending,
  EXISTS(SELECT 1 FROM financial.account a WHERE a.type='资产' AND a.subtype='现金及等价物') cash_configured,
  (SELECT jsonb_agg(p.value ORDER BY p.i) FROM (
    SELECT i,coalesce(sum(e.signed_amount) FILTER(WHERE e.type IN ('资产','负债')),0)::text value
    FROM generate_series(0,5) i
    LEFT JOIN entries e ON e.occurred_at < date_trunc('milliseconds',b.start+(b.as_of-b.start)*i/5)
    GROUP BY i
  ) p) balance_trend,
  (SELECT jsonb_build_object(
    'cash_in',coalesce(sum(greatest(net,0)),0)::text,
    'cash_out',coalesce(sum(greatest(-net,0)),0)::text,
    'cash_net',coalesce(sum(net),0)::text
  ) FROM future_cash) cash,
  CASE WHEN EXISTS(SELECT 1 FROM future_cash WHERE net<>0) THEN
    (SELECT jsonb_agg(p.bar ORDER BY p.i) FROM (
      SELECT i,jsonb_build_object(
        'start',b.as_of+interval '144 hours'*i,
        'end',b.as_of+interval '144 hours'*(i+1),
        'inflow',coalesce(sum(greatest(c.net,0)),0)::text,
        'outflow',coalesce(sum(greatest(-c.net,0)),0)::text
      ) bar
      FROM generate_series(0,4) i LEFT JOIN future_cash c
        ON c.occurred_at>=b.as_of+interval '144 hours'*i AND c.occurred_at<b.as_of+interval '144 hours'*(i+1)
      GROUP BY i
    ) p) ELSE '[]'::jsonb END cash_bars,
  (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'occurred_at',t.occurred_at,'merchant',t.merchant,'notes',t.notes,
    'amount',t.amount,'kind',t.kind,'category',coalesce((
      SELECT string_agg(DISTINCT coalesce(nullif(a.subtype,''),a.name),' / ')
      FROM financial.entry e JOIN financial.account a ON a.id=e.account_id
      WHERE e.transaction_id=t.id AND a.type IN ('收入','支出')
    ),'')
  ) ORDER BY t.occurred_at DESC,t.id DESC),'[]'::jsonb)
  FROM (SELECT id,occurred_at,merchant,notes,amount,kind FROM financial.transactions ORDER BY occurred_at DESC,id DESC LIMIT 3) t) recent
FROM bounds b CROSS JOIN LATERAL (
  SELECT coalesce(sum(signed_amount) FILTER(WHERE type='资产'),0)::text assets,
    (-coalesce(sum(signed_amount) FILTER(WHERE type='负债'),0))::text liabilities,
    coalesce(sum(signed_amount) FILTER(WHERE type IN ('资产','负债')),0)::text net_assets,
    (-coalesce(sum(signed_amount) FILTER(WHERE type='收入' AND occurred_at>=b.start),0))::text income,
    coalesce(sum(signed_amount) FILTER(WHERE type='支出' AND occurred_at>=b.start),0)::text expense,
    (-coalesce(sum(signed_amount) FILTER(WHERE type IN ('收入','支出') AND occurred_at>=b.start),0))::text profit
  FROM entries WHERE occurred_at<b.as_of
) totals;
REVOKE ALL ON financial.home FROM PUBLIC;
GRANT SELECT ON financial.home TO authenticated,anonymous,financial_writer;
NOTIFY pgrst,'reload schema';
