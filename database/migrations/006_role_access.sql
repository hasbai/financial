-- Auth0 supplies the signed role claim; Data API validates the JWT and selects
-- superadmin. PostgreSQL grants are the authorization boundary.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='superadmin') THEN
  CREATE ROLE superadmin NOLOGIN NOSUPERUSER NOBYPASSRLS;
 END IF;
END $$;
GRANT superadmin TO authenticator,neondb_owner;
GRANT USAGE ON SCHEMA financial TO superadmin;
REVOKE ALL ON SCHEMA financial FROM PUBLIC,anonymous,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA financial FROM PUBLIC,anonymous,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA financial FROM PUBLIC,anonymous,authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA financial FROM PUBLIC,anonymous,authenticated;

-- Remove page-specific projections, without changing any source report definition.
DROP VIEW IF EXISTS financial.home;
DROP VIEW IF EXISTS financial.cashflow_daily;
DROP VIEW IF EXISTS financial.cashflow_read;
DROP VIEW IF EXISTS financial.balance_read;
DROP VIEW IF EXISTS financial.balance_history_read;
DROP FUNCTION IF EXISTS financial.read_balance();
DROP FUNCTION IF EXISTS financial.read_balance_history();
DROP FUNCTION IF EXISTS financial.overview(timestamptz,timestamptz,timestamptz);
DROP FUNCTION IF EXISTS financial.get_accounts();
DROP FUNCTION IF EXISTS financial.transactions_page(jsonb,jsonb,integer);

-- Business validation and atomic saving stay in SQL; repeated JWT checks do not.
DO $migration$
DECLARE signature regprocedure; definition text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'financial.save_transaction(integer,timestamp with time zone,jsonb)'::regprocedure,
  'financial.save_account(integer,jsonb)'::regprocedure,
  'financial.refresh_balances()'::regprocedure
 ] LOOP
  definition := pg_get_functiondef(signature);
  definition := replace(definition,
   'IF NOT financial.is_owner() THEN RAISE EXCEPTION ''FORBIDDEN'' USING ERRCODE=''42501''; END IF;', '');
  IF position('is_owner' IN definition)>0 THEN
   RAISE EXCEPTION 'Unexpected identity guard in %',signature;
  END IF;
  EXECUTE definition;
 END LOOP;
END $migration$;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['account','transaction','entry'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS personal_read ON financial.%I',n);
  EXECUTE format('DROP POLICY IF EXISTS personal_write ON financial.%I',n);
  EXECUTE format('ALTER TABLE financial.%I DISABLE ROW LEVEL SECURITY',n);
 END LOOP;
END $$;
DROP FUNCTION financial.is_owner();

GRANT SELECT ON financial.account,financial.transaction,financial.entry,
 financial.transactions,financial.statement_entries,financial.income_statement,
 financial.balance,financial.balance_history,financial.cashflow TO superadmin;
GRANT EXECUTE ON FUNCTION financial.save_transaction(integer,timestamptz,jsonb),
 financial.save_account(integer,jsonb) TO superadmin;
-- transaction_detail is an internal return value helper for atomic saving.
REVOKE ALL ON FUNCTION financial.transaction_detail(integer),financial.refresh_balances() FROM superadmin;
NOTIFY pgrst,'reload schema';
