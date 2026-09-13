-- Read-only baseline for hasbai / explicitly selected branch / neondb.
-- No row-level personal details or amounts are returned.
WITH tx AS (
  SELECT
    t.id,
    t.status,
    count(e.id) AS entries,
    count(e.id) FILTER (WHERE e.account_id IS NULL) AS missing_accounts,
    coalesce(sum(CASE WHEN e.direction::text = '借'
      THEN e.amount ELSE -e.amount END), 0) AS imbalance
  FROM financial.transaction AS t
  LEFT JOIN financial.entry AS e ON e.transaction_id = t.id
  GROUP BY t.id, t.status
)
SELECT jsonb_build_object(
  'counts', jsonb_build_object(
    'accounts', (SELECT count(*) FROM financial.account),
    'transactions', (SELECT count(*) FROM financial.transaction),
    'entries', (SELECT count(*) FROM financial.entry),
    'unmatched_entries', (SELECT count(*) FROM financial.entry WHERE account_id IS NULL),
    'transactions_missing_accounts', (SELECT count(*) FROM tx WHERE missing_accounts > 0),
    'transactions_without_entries', (SELECT count(*) FROM tx WHERE entries = 0),
    'unbalanced_transactions', (SELECT count(*) FROM tx WHERE imbalance <> 0),
    'nonpositive_entries', (SELECT count(*) FROM financial.entry WHERE amount <= 0),
    'missing_status', (SELECT count(*) FROM financial.transaction WHERE status IS NULL),
    'missing_merchant', (SELECT count(*) FROM financial.transaction
      WHERE merchant IS NULL OR btrim(merchant) = '')
  ),
  'by_status', (SELECT jsonb_agg(to_jsonb(s)) FROM (
    SELECT status, count(*) AS transactions,
      count(*) FILTER (WHERE entries = 0) AS without_entries,
      count(*) FILTER (WHERE missing_accounts > 0) AS missing_accounts
    FROM tx GROUP BY status ORDER BY status
  ) AS s),
  'relations', (SELECT jsonb_agg(to_jsonb(r)) FROM (
    SELECT c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity
    FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = 'financial' AND c.relkind IN ('r', 'p', 'v', 'm')
    ORDER BY c.relname
  ) AS r)
) AS baseline;
