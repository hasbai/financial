-- One Data API call saves article fields and their tag relationships atomically.
BEGIN;

CREATE FUNCTION public.save_article(
  p_id uuid,
  p_updated_at timestamptz,
  p_title text,
  p_slug text,
  p_excerpt text,
  p_markdown text,
  p_cover_id uuid,
  p_status text,
  p_published_at timestamptz,
  p_tag_ids uuid[]
) RETURNS public.article
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  saved public.article;
BEGIN
  IF p_tag_ids IS NULL OR cardinality(p_tag_ids) > 30 THEN
    RAISE EXCEPTION '文章标签不能超过 30 个' USING ERRCODE = '22023';
  END IF;

  IF p_updated_at IS NULL THEN
    INSERT INTO public.article (id, title, slug, excerpt, markdown, cover_id, status, published_at, tag_ids, updated_at)
    VALUES (p_id, p_title, p_slug, p_excerpt, p_markdown, p_cover_id, p_status, p_published_at, p_tag_ids, clock_timestamp())
    RETURNING * INTO saved;
  ELSE
    UPDATE public.article
    SET title = p_title, slug = p_slug, excerpt = p_excerpt, markdown = p_markdown,
      cover_id = p_cover_id, status = p_status, published_at = p_published_at, tag_ids = p_tag_ids,
      updated_at = clock_timestamp()
    WHERE id = p_id AND updated_at = p_updated_at
    RETURNING * INTO saved;
    IF saved.id IS NULL THEN
      RAISE EXCEPTION '文章已被更新，请重新打开后编辑' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  DELETE FROM public.article_tag
  WHERE article_id = saved.id AND tag_id <> ALL(p_tag_ids);
  INSERT INTO public.article_tag (article_id, tag_id)
  SELECT saved.id, tag_id FROM unnest(p_tag_ids) AS tag_id
  ON CONFLICT DO NOTHING;
  RETURN saved;
END;
$$;

REVOKE ALL ON FUNCTION public.save_article(uuid,timestamptz,text,text,text,text,uuid,text,timestamptz,uuid[]) FROM PUBLIC, anonymous;
GRANT EXECUTE ON FUNCTION public.save_article(uuid,timestamptz,text,text,text,text,uuid,text,timestamptz,uuid[]) TO superadmin;
NOTIFY pgrst, 'reload schema';
COMMIT;
