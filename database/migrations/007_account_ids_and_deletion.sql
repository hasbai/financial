-- Preserve the three tables. Existing callers may omit an account ID; new clients
-- choose one explicitly. ID changes use the existing ON UPDATE CASCADE foreign key.
CREATE OR REPLACE FUNCTION financial.save_account(p_id integer,p_payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE a financial.account; target_id integer; type_code integer; prefix integer; subtype_name text;
BEGIN
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR coalesce(trim(p_payload->>'name'),'')='' OR coalesce(trim(p_payload->>'subtype'),'')='' THEN
  RAISE EXCEPTION 'VALIDATION: 请填写科目名称和子类';
 END IF;
 type_code := CASE p_payload->>'type' WHEN '资产' THEN 1 WHEN '负债' THEN 2 WHEN '净资产' THEN 3 WHEN '收入' THEN 4 WHEN '支出' THEN 5 END;
 IF type_code IS NULL THEN RAISE EXCEPTION 'VALIDATION: 科目类型无效'; END IF;
 subtype_name := trim(p_payload->>'subtype');
 -- Serialize ID allocation and account edits, including callers of the old UI.
 LOCK TABLE financial.account IN SHARE ROW EXCLUSIVE MODE;
 IF p_id IS NOT NULL THEN
  SELECT * INTO a FROM financial.account WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONFLICT: 科目已更新或删除'; END IF;
 END IF;
 SELECT id/100 INTO prefix FROM financial.account
  WHERE type::text=p_payload->>'type' AND subtype=subtype_name AND id IS DISTINCT FROM p_id ORDER BY id LIMIT 1;
 IF p_payload ? 'id' THEN
  IF coalesce(p_payload->>'id','') !~ '^[1-5][0-9]{4}$' THEN RAISE EXCEPTION 'VALIDATION: 科目 ID 必须为五位数字'; END IF;
  target_id := (p_payload->>'id')::integer;
 ELSIF p_id IS NOT NULL THEN target_id := p_id;
 ELSE
  IF prefix IS NULL THEN
   SELECT type_code*100+n INTO prefix FROM generate_series(0,99) n
    WHERE NOT EXISTS(SELECT 1 FROM financial.account WHERE id/100=type_code*100+n) ORDER BY n LIMIT 1;
  END IF;
  SELECT prefix*100+n INTO target_id FROM generate_series(1,99) n
   WHERE NOT EXISTS(SELECT 1 FROM financial.account WHERE id=prefix*100+n) ORDER BY n LIMIT 1;
 END IF;
 IF target_id IS NULL THEN RAISE EXCEPTION 'VALIDATION: 子类编号已用完'; END IF;
 IF target_id/10000<>type_code THEN RAISE EXCEPTION 'VALIDATION: 科目 ID 首位与类型不符'; END IF;
 IF prefix IS NOT NULL AND target_id/100<>prefix THEN RAISE EXCEPTION 'VALIDATION: 科目 ID 前三位与子类不符'; END IF;
 IF EXISTS(SELECT 1 FROM financial.account WHERE id=target_id AND id IS DISTINCT FROM p_id) THEN RAISE EXCEPTION 'VALIDATION: 科目 ID 已存在'; END IF;
 IF p_id IS NULL THEN
  INSERT INTO financial.account(id,type,subtype,name,notes) VALUES(target_id,(p_payload->>'type')::financial.first_account,subtype_name,trim(p_payload->>'name'),nullif(p_payload->>'notes','')) RETURNING * INTO a;
 ELSE
  -- A stale transaction editor must reload after an account ID is changed.
  IF target_id<>p_id THEN
   UPDATE financial.transaction SET updated_at=clock_timestamp()
    WHERE id IN (SELECT transaction_id FROM financial.entry WHERE account_id=p_id);
  END IF;
  UPDATE financial.account SET id=target_id,type=(p_payload->>'type')::financial.first_account,
   name=trim(p_payload->>'name'),subtype=subtype_name,notes=nullif(p_payload->>'notes','') WHERE id=p_id RETURNING * INTO a;
 END IF;
 PERFORM financial.refresh_balances();
 RETURN to_jsonb(a);
END $$;

CREATE OR REPLACE FUNCTION financial.delete_transaction(p_id integer,p_updated_at timestamptz)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE old financial.transaction;
BEGIN
 SELECT * INTO old FROM financial.transaction WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CONFLICT: 交易已更新或删除'; END IF;
 IF p_updated_at IS DISTINCT FROM old.updated_at THEN RAISE EXCEPTION 'CONFLICT: 记录已更新，请重新载入'; END IF;
 -- Existing FK cascades to every entry, including same-transaction refunds.
 DELETE FROM financial.transaction WHERE id=p_id;
 PERFORM financial.refresh_balances();
END $$;

CREATE OR REPLACE FUNCTION financial.delete_account(p_id integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM financial.account WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CONFLICT: 科目已更新或删除'; END IF;
 IF EXISTS(SELECT 1 FROM financial.entry WHERE account_id=p_id) THEN
  RAISE EXCEPTION 'VALIDATION: 科目已被交易使用，无法删除';
 END IF;
 DELETE FROM financial.account WHERE id=p_id;
 PERFORM financial.refresh_balances();
END $$;
GRANT CREATE ON SCHEMA financial TO financial_writer;
ALTER FUNCTION financial.delete_transaction(integer,timestamptz) OWNER TO financial_writer;
ALTER FUNCTION financial.delete_account(integer) OWNER TO financial_writer;
REVOKE CREATE ON SCHEMA financial FROM financial_writer;
REVOKE ALL ON FUNCTION financial.delete_transaction(integer,timestamptz),financial.delete_account(integer) FROM PUBLIC,anonymous,authenticated;
GRANT EXECUTE ON FUNCTION financial.delete_transaction(integer,timestamptz),financial.delete_account(integer) TO superadmin;
NOTIFY pgrst,'reload schema';
