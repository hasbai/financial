-- Prepare inherited content without breaking the currently deployed blog.
BEGIN;

CREATE TABLE public.content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  excerpt text NOT NULL DEFAULT '',
  markdown text NOT NULL DEFAULT '',
  cover_id uuid,
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The old category path remains only as a redirect key; category is no longer
-- part of the writing model. Resolve cross-category slug collisions before
-- adding the site-wide article slug constraint.
ALTER TABLE public.article ADD COLUMN legacy_path text;
UPDATE public.article AS a
SET legacy_path = '/' || c.slug || '/' || a.slug
FROM public.category AS c
WHERE c.id = a.category_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.article WHERE legacy_path IS NULL
  ) THEN
    RAISE EXCEPTION 'An article has no category redirect path';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.article a, unnest(a.tag_ids) AS old_tag(id)
    LEFT JOIN public.tag t ON t.id = old_tag.id
    WHERE t.id IS NULL
  ) THEN
    RAISE EXCEPTION 'An article references a missing tag';
  END IF;
END $$;

WITH ranked AS (
  SELECT id, slug,
    row_number() OVER (PARTITION BY slug ORDER BY created_at, id) AS position
  FROM public.article
)
UPDATE public.article AS a
SET slug = left(r.slug, 151) || '-' || left(replace(a.id::text, '-', ''), 8)
FROM ranked AS r
WHERE a.id = r.id AND r.position > 1;

ALTER TABLE public.article ADD CONSTRAINT article_slug_unique UNIQUE (slug);
ALTER TABLE public.article ADD CONSTRAINT article_legacy_path_unique UNIQUE (legacy_path);
ALTER TABLE public.article ADD COLUMN kind text NOT NULL DEFAULT 'article';
ALTER TABLE public.article ADD CONSTRAINT article_kind_check CHECK (kind = 'article');
ALTER TABLE public.article INHERIT public.content;

CREATE SEQUENCE public.article_number_seq;
ALTER TABLE public.article ADD COLUMN sequence bigint NOT NULL DEFAULT nextval('public.article_number_seq');
ALTER SEQUENCE public.article_number_seq OWNED BY public.article.sequence;
ALTER TABLE public.article ADD CONSTRAINT article_sequence_unique UNIQUE (sequence);

CREATE SEQUENCE public.note_number_seq;
CREATE TABLE public.note (
  sequence bigint NOT NULL DEFAULT nextval('public.note_number_seq'),
  CONSTRAINT note_pkey PRIMARY KEY (id),
  CONSTRAINT note_sequence_unique UNIQUE (sequence),
  CONSTRAINT note_kind_check CHECK (kind = 'note'),
  CONSTRAINT note_excerpt_check CHECK (length(excerpt) <= 600),
  CONSTRAINT note_markdown_check CHECK (octet_length(markdown) <= 1048576),
  CONSTRAINT note_status_check CHECK (status IN ('draft', 'published')),
  CONSTRAINT note_publication_check CHECK (status <> 'published' OR (published_at IS NOT NULL AND length(btrim(markdown)) > 0)),
  CONSTRAINT note_cover_fkey FOREIGN KEY (cover_id) REFERENCES public.image(id) ON DELETE SET NULL
) INHERITS (public.content);
ALTER TABLE public.note ALTER COLUMN kind SET DEFAULT 'note';
ALTER SEQUENCE public.note_number_seq OWNED BY public.note.sequence;
CREATE INDEX note_published ON public.note (published_at DESC, id) WHERE status = 'published';

CREATE TABLE public.article_tag (
  article_id uuid NOT NULL REFERENCES public.article(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tag(id) ON DELETE RESTRICT,
  PRIMARY KEY (article_id, tag_id)
);
CREATE INDEX article_tag_by_tag ON public.article_tag (tag_id, article_id);
INSERT INTO public.article_tag (article_id, tag_id)
SELECT DISTINCT a.id, old_tag.id
FROM public.article AS a, unnest(a.tag_ids) AS old_tag(id);

-- The old frontend still selects and writes these fields until the new Worker
-- is live. New article writes can omit the former required category.
ALTER TABLE public.article ALTER COLUMN category_id DROP NOT NULL;

ALTER TABLE public.content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.note ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_tag ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.content, public.note, public.article_tag TO anonymous;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.note, public.article_tag TO superadmin;
GRANT USAGE, SELECT ON SEQUENCE public.article_number_seq, public.note_number_seq TO superadmin;
CREATE POLICY content_public ON public.content FOR SELECT TO anonymous
  USING (status = 'published' AND published_at <= now());
CREATE POLICY note_public ON public.note FOR SELECT TO anonymous
  USING (status = 'published' AND published_at <= now());
CREATE POLICY note_editor ON public.note TO superadmin USING (true) WITH CHECK (true);
CREATE POLICY article_tag_public ON public.article_tag FOR SELECT TO anonymous
  USING (EXISTS (
    SELECT 1 FROM public.article a
    WHERE a.id = article_id AND a.status = 'published' AND a.published_at <= now()
  ));
CREATE POLICY article_tag_editor ON public.article_tag TO superadmin USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
COMMIT;
