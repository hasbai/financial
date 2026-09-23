-- Run only after the new blog Worker has deployed and been verified.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.article a, unnest(a.tag_ids) AS old_tag(id)
    LEFT JOIN public.tag t ON t.id = old_tag.id
    WHERE t.id IS NULL
  ) THEN
    RAISE EXCEPTION 'An article references a missing tag';
  END IF;
END $$;

-- Old clients could have edited tag_ids between the prepare migration and
-- deployment. The new save function kept both representations synchronized.
DELETE FROM public.article_tag AS link
USING public.article AS article
WHERE link.article_id = article.id AND link.tag_id <> ALL(article.tag_ids);
INSERT INTO public.article_tag (article_id, tag_id)
SELECT DISTINCT a.id, old_tag.id
FROM public.article AS a, unnest(a.tag_ids) AS old_tag(id)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.save_article(
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
    INSERT INTO public.article (id, title, slug, excerpt, markdown, cover_id, status, published_at, updated_at)
    VALUES (p_id, p_title, p_slug, p_excerpt, p_markdown, p_cover_id, p_status, p_published_at, clock_timestamp())
    RETURNING * INTO saved;
  ELSE
    UPDATE public.article
    SET title = p_title, slug = p_slug, excerpt = p_excerpt, markdown = p_markdown,
      cover_id = p_cover_id, status = p_status, published_at = p_published_at,
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

ALTER TABLE public.article DROP COLUMN category_id;
ALTER TABLE public.article DROP COLUMN tag_ids;
DROP TABLE public.category;
NOTIFY pgrst, 'reload schema';
COMMIT;
