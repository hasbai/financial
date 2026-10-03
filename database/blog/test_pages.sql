-- Run against the isolated migration branch. Test writes are rolled back.
BEGIN;
SET LOCAL ROLE superadmin;
INSERT INTO public.page (id, title, slug, markdown, status, published_at) VALUES
('50000000-0000-4000-8000-000000000001', 'test draft', 'test-draft', 'draft', 'draft', NULL),
('50000000-0000-4000-8000-000000000002', 'test future', 'test-future', 'future', 'published', now() + interval '1 day'),
('50000000-0000-4000-8000-000000000003', 'test public', 'test-public', 'public', 'published', now() - interval '1 day');
DO $$
DECLARE changed integer;
BEGIN
  UPDATE public.page SET title = 'changed', updated_at = now() + interval '1 second'
  WHERE id = '50000000-0000-4000-8000-000000000003' AND updated_at = now();
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'editor update failed'; END IF;
  UPDATE public.page SET title = 'stale' WHERE id = '50000000-0000-4000-8000-000000000003' AND updated_at = now();
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 0 THEN RAISE EXCEPTION 'stale update succeeded'; END IF;
  BEGIN
    INSERT INTO public.page (title, slug) VALUES ('duplicate', 'about');
    RAISE EXCEPTION 'duplicate path accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.page (title, slug) VALUES ('reserved', 'studio');
    RAISE EXCEPTION 'reserved path accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.page (title, slug, status, published_at) VALUES ('empty', 'test-empty', 'published', now());
    RAISE EXCEPTION 'empty publication accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
SET LOCAL ROLE anonymous;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.page WHERE slug IN ('test-draft', 'test-future')) THEN
    RAISE EXCEPTION 'anonymous reads unpublished pages';
  END IF;
  IF EXISTS (SELECT 1 FROM public.content WHERE id IN ('50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002')) THEN
    RAISE EXCEPTION 'parent exposes unpublished pages';
  END IF;
  IF (SELECT count(*) FROM public.page WHERE slug IN ('about', 'privacy', 'terms', 'test-public')) <> 4 THEN
    RAISE EXCEPTION 'anonymous cannot read published pages';
  END IF;
  BEGIN
    INSERT INTO public.page (title, slug) VALUES ('unauthorized', 'test-unauthorized');
    RAISE EXCEPTION 'anonymous writes pages';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SET LOCAL ROLE superadmin;
DELETE FROM public.page WHERE id = '50000000-0000-4000-8000-000000000003';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.page WHERE id = '50000000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'editor delete failed';
  END IF;
END $$;
ROLLBACK;
