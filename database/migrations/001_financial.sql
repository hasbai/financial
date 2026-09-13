-- Original three-table structure is unchanged. Only access policies, views and functions.
CREATE ROLE financial_writer NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT financial_writer TO neondb_owner;
CREATE FUNCTION financial.is_owner() RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT coalesce(c->>'sub'='auth0|6a9e921870e37d7bbfb76c8f' AND c->>'iss'='https://hasbai.eu.auth0.com/'
 AND (c->'aud' ? 'https://financial.hasbai.xyz/api' OR c->>'aud'='https://financial.hasbai.xyz/api'),false)
 FROM (SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb c) s
$$;
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['account','transaction','entry'] LOOP
 EXECUTE format('ALTER TABLE financial.%I ENABLE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY personal_read ON financial.%I FOR SELECT TO authenticated,anonymous,financial_writer USING (financial.is_owner())',n);
 EXECUTE format('CREATE POLICY personal_write ON financial.%I FOR ALL TO financial_writer USING (financial.is_owner()) WITH CHECK (financial.is_owner())',n);
 END LOOP;
END $$;
-- External Auth0 tokens without a role claim map to the configured PostgREST default role.
-- Both API roles still require the exact verified owner claims through RLS.
GRANT USAGE ON SCHEMA financial TO authenticated,anonymous,financial_writer;
GRANT SELECT ON financial.account,financial.transaction,financial.entry TO authenticated,anonymous;
GRANT SELECT,INSERT,UPDATE,DELETE ON financial.account,financial.transaction,financial.entry TO financial_writer;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA financial TO financial_writer;

CREATE VIEW financial.transactions WITH(security_invoker=true) AS
 SELECT t.*,s.entry_count,s.missing_accounts,
 (s.entry_count>=2 AND s.missing_accounts=0 AND s.delta=0 AND s.invalid_amounts=0) complete,
 CASE WHEN s.expense_count>0 THEN abs(s.expense_net-s.income_net)::text WHEN s.income_count>0 THEN abs(s.income_net)::text ELSE s.debit::text END amount,
 CASE WHEN s.expense_count>0 THEN CASE WHEN s.expense_net-s.income_net<0 THEN 'refund' ELSE 'expense' END WHEN s.income_count>0 THEN 'income' ELSE 'transfer' END kind,
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'account_id',e.account_id,'direction',e.direction,'amount',e.amount::text) ORDER BY e.id) FROM financial.entry e WHERE e.transaction_id=t.id),'[]') entries
 FROM financial.transaction t CROSS JOIN LATERAL (
 SELECT count(*)::integer entry_count,count(*) FILTER(WHERE e.account_id IS NULL)::integer missing_accounts,
 count(*) FILTER(WHERE e.amount<=0) invalid_amounts,
 sum(e.amount) FILTER(WHERE direction='借') debit,
 coalesce(sum(CASE WHEN direction='借' THEN e.amount ELSE -e.amount END),0) delta,
 count(*) FILTER(WHERE a.type='支出') expense_count,count(*) FILTER(WHERE a.type='收入') income_count,
 coalesce(sum(CASE WHEN direction='借' THEN e.amount ELSE -e.amount END) FILTER(WHERE a.type='支出'),0) expense_net,
 coalesce(sum(CASE WHEN direction='贷' THEN e.amount ELSE -e.amount END) FILTER(WHERE a.type='收入'),0) income_net
 FROM financial.entry e LEFT JOIN financial.account a ON a.id=e.account_id WHERE transaction_id=t.id) s;
CREATE VIEW financial.statement_entries WITH(security_invoker=true) AS
 SELECT e.*,t.occurred_at,a.type,a.name,a.subtype,
 CASE WHEN e.direction='借' THEN e.amount ELSE -e.amount END signed_amount
 FROM financial.entry e JOIN financial.transactions t ON t.id=e.transaction_id JOIN financial.account a ON a.id=e.account_id
 WHERE t.complete AND t.status IN ('success','refund','partial_refund');
CREATE VIEW financial.cashflow WITH(security_invoker=true) AS
 SELECT transaction_id,occurred_at,
 coalesce(sum(signed_amount) FILTER(WHERE type='资产' AND subtype='现金及等价物'),0) net,
 CASE WHEN bool_or(type IN ('收入','支出')) THEN 'living' WHEN bool_or(type='资产' AND subtype<>'现金及等价物') THEN 'investing' ELSE 'financing' END category
 FROM financial.statement_entries GROUP BY transaction_id,occurred_at;

CREATE FUNCTION financial.transactions_page(p_filters jsonb DEFAULT '{}',p_cursor jsonb DEFAULT NULL,p_limit integer DEFAULT 30)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 WITH filtered AS (SELECT t.* FROM financial.transactions t WHERE
 (nullif(p_filters->>'start','') IS NULL OR occurred_at >= (p_filters->>'start')::timestamptz)
 AND (nullif(p_filters->>'end','') IS NULL OR occurred_at < (p_filters->>'end')::timestamptz)
 AND (coalesce(p_filters->>'search','')='' OR strpos(lower(concat_ws(' ',merchant,notes)),lower(p_filters->>'search'))>0)
 AND (coalesce(p_filters->>'review','') NOT IN ('needed','unmatched') OR CASE WHEN p_filters->>'review'='unmatched' THEN missing_accounts>0 ELSE NOT complete AND status IS DISTINCT FROM 'cancel' END)
 AND (coalesce(p_filters->>'status','')='' OR status::text=p_filters->>'status')
 AND (coalesce(p_filters->>'payment_method','')='' OR payment_method::text=p_filters->>'payment_method')
 AND (coalesce(p_filters->>'posted','')<>'true' OR (complete AND status IN ('success','refund','partial_refund')))
 AND (coalesce(p_filters->>'account_id','')='' OR EXISTS(SELECT 1 FROM financial.entry e WHERE e.transaction_id=t.id AND e.account_id=(p_filters->>'account_id')::integer))
 AND (coalesce(p_filters->>'account_type','')='' OR EXISTS(SELECT 1 FROM financial.entry e JOIN financial.account a ON a.id=e.account_id WHERE e.transaction_id=t.id AND a.type::text=p_filters->>'account_type'))
 AND (coalesce(p_filters->>'cash','')<>'true' OR EXISTS(SELECT 1 FROM financial.cashflow c WHERE c.transaction_id=t.id AND c.net<>0))
 AND (p_cursor IS NULL OR (occurred_at,id)<((p_cursor->>'occurred_at')::timestamptz,(p_cursor->>'id')::integer))
 ), page AS (SELECT * FROM filtered ORDER BY occurred_at DESC,id DESC LIMIT least(greatest(p_limit,1),100))
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY occurred_at DESC,id DESC) FROM page),'[]'),
 'next_cursor',CASE WHEN (SELECT count(*) FROM filtered)>least(greatest(p_limit,1),100) THEN (SELECT jsonb_build_object('occurred_at',occurred_at,'id',id) FROM page ORDER BY occurred_at,id LIMIT 1) END)
$$;
CREATE FUNCTION financial.transaction_detail(p_id integer) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$ SELECT to_jsonb(t) FROM financial.transactions t WHERE id=p_id $$;
CREATE FUNCTION financial.save_transaction(p_id integer,p_updated_at timestamptz,p_payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old financial.transaction; tid integer; item jsonb; debit numeric:=0; credit numeric:=0; amount numeric;
 eid integer; used_ids integer[]:='{}'; count_entries integer:=0;
BEGIN
 IF NOT financial.is_owner() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR jsonb_typeof(p_payload->'entries') IS DISTINCT FROM 'array' OR length(p_payload::text)>100000 OR jsonb_array_length(p_payload->'entries')>100 THEN RAISE EXCEPTION 'VALIDATION: 请求格式无效'; END IF;
 IF p_id IS NOT NULL THEN
 SELECT * INTO old FROM financial.transaction WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_updated_at IS DISTINCT FROM old.updated_at THEN RAISE EXCEPTION 'CONFLICT: 记录已更新，请重新载入'; END IF;
 tid:=p_id;
 END IF;
 IF nullif(p_payload->>'occurred_at','') IS NULL OR coalesce(p_payload->>'status','') NOT IN ('success','pending','cancel','refund','partial_refund') THEN RAISE EXCEPTION 'VALIDATION: 日期或状态无效'; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(p_payload->'entries') LOOP
 IF coalesce(item->>'amount','') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$' OR coalesce(item->>'direction','') NOT IN ('借','贷') THEN RAISE EXCEPTION 'VALIDATION: 金额最多两位小数，方向为借或贷'; END IF;
 amount:=(item->>'amount')::numeric;
 IF amount<=0 THEN RAISE EXCEPTION 'VALIDATION: 金额必须大于零'; END IF;
 IF nullif(item->>'account_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM financial.account WHERE id=(item->>'account_id')::integer) THEN RAISE EXCEPTION 'VALIDATION: 科目不存在'; END IF;
 IF item->>'direction'='借' THEN debit:=debit+amount; ELSE credit:=credit+amount; END IF;
 count_entries:=count_entries+1;
 END LOOP;
 IF count_entries>0 AND (count_entries<2 OR debit<>credit) THEN RAISE EXCEPTION 'VALIDATION: 分录至少两条且借贷平衡'; END IF;
 IF tid IS NULL THEN INSERT INTO financial.transaction DEFAULT VALUES RETURNING id INTO tid; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(p_payload->'entries') LOOP
 eid:=nullif(item->>'id','')::integer;
 IF eid IS NULL THEN INSERT INTO financial.entry(transaction_id,account_id,direction,amount) VALUES(tid,nullif(item->>'account_id','')::integer,(item->>'direction')::financial.direction,(item->>'amount')::numeric) RETURNING id INTO eid;
 ELSE
 IF eid=ANY(used_ids) THEN RAISE EXCEPTION 'VALIDATION: 重复分录ID'; END IF;
 UPDATE financial.entry SET account_id=nullif(item->>'account_id','')::integer,direction=(item->>'direction')::financial.direction,amount=(item->>'amount')::numeric WHERE id=eid AND transaction_id=tid;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 used_ids:=array_append(used_ids,eid);
 END LOOP;
 DELETE FROM financial.entry WHERE transaction_id=tid AND NOT(id=ANY(used_ids));
 UPDATE financial.transaction SET occurred_at=(p_payload->>'occurred_at')::timestamptz,status=(p_payload->>'status')::financial.transaction_status,
 payment_method=(p_payload->>'payment_method')::financial.payment_method,merchant=nullif(p_payload->>'merchant',''),notes=nullif(p_payload->>'notes',''),
 payment_id=nullif(p_payload->>'payment_id',''),updated_at=clock_timestamp() WHERE id=tid;
 RETURN financial.transaction_detail(tid);
END $$;
CREATE FUNCTION financial.save_account(p_id integer,p_payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a financial.account;
BEGIN
 IF NOT financial.is_owner() THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF coalesce(trim(p_payload->>'name'),'')='' OR coalesce(trim(p_payload->>'subtype'),'')='' THEN RAISE EXCEPTION 'VALIDATION: 请填写科目名称和子类'; END IF;
 IF p_id IS NULL THEN INSERT INTO financial.account(type,subtype,name,notes) VALUES((p_payload->>'type')::financial.first_account,p_payload->>'subtype',trim(p_payload->>'name'),nullif(p_payload->>'notes','')) RETURNING * INTO a;
 ELSE UPDATE financial.account SET type=(p_payload->>'type')::financial.first_account,name=trim(p_payload->>'name'),subtype=p_payload->>'subtype',notes=nullif(p_payload->>'notes','') WHERE id=p_id RETURNING * INTO a;
 IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN to_jsonb(a);
END $$;
GRANT CREATE ON SCHEMA financial TO financial_writer;
ALTER FUNCTION financial.save_transaction(integer,timestamptz,jsonb) OWNER TO financial_writer;
ALTER FUNCTION financial.save_account(integer,jsonb) OWNER TO financial_writer;
REVOKE CREATE ON SCHEMA financial FROM financial_writer;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA financial FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA financial TO authenticated,anonymous,financial_writer;
GRANT SELECT ON financial.transactions,financial.statement_entries,financial.cashflow TO authenticated,anonymous,financial_writer;
