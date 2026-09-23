-- Public blog: four base tables, no read views or RPCs. Financial objects untouched.
BEGIN;
CREATE TABLE public.category (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
 slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$' AND slug NOT IN ('articles','studio','auth','api','images','tags','sitemap.xml','robots.txt')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.tag (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL UNIQUE CHECK (length(btrim(name)) BETWEEN 1 AND 80),
 slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.image (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), -- exact R2 object key; no extension
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 240),
 sha256 text NOT NULL UNIQUE CHECK (sha256 ~ '^[a-f0-9]{64}$'),
 content_type text NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/webp','image/gif')),
 size integer NOT NULL CHECK (size BETWEEN 1 AND 10485760),
 width integer CHECK (width > 0), height integer CHECK (height > 0),
 ready boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.article (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 240),
 slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,159}$'),
 category_id uuid NOT NULL REFERENCES public.category(id) ON DELETE RESTRICT,
 tag_ids uuid[] NOT NULL DEFAULT '{}',
 excerpt text NOT NULL DEFAULT '' CHECK (length(excerpt) <= 600),
 markdown text NOT NULL DEFAULT '' CHECK (octet_length(markdown) <= 1048576),
 cover_id uuid REFERENCES public.image(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
 published_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (category_id, slug),
 CHECK (status <> 'published' OR (published_at IS NOT NULL AND length(btrim(markdown)) > 0)),
 CHECK (cardinality(tag_ids) <= 30)
);
CREATE INDEX article_published ON public.article (published_at DESC, id) WHERE status = 'published';
CREATE INDEX article_tags ON public.article USING gin (tag_ids);
ALTER TABLE public.article ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public TO anonymous, superadmin;
GRANT SELECT ON public.article, public.category, public.tag, public.image TO anonymous;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.article, public.category, public.tag, public.image TO superadmin;
CREATE POLICY article_public ON public.article FOR SELECT TO anonymous USING (status = 'published' AND published_at <= now());
CREATE POLICY category_public ON public.category FOR SELECT TO anonymous USING (true);
CREATE POLICY tag_public ON public.tag FOR SELECT TO anonymous USING (true);
CREATE POLICY image_public ON public.image FOR SELECT TO anonymous USING (ready);
CREATE POLICY article_editor ON public.article TO superadmin USING (true) WITH CHECK (true);
CREATE POLICY category_editor ON public.category TO superadmin USING (true) WITH CHECK (true);
CREATE POLICY tag_editor ON public.tag TO superadmin USING (true) WITH CHECK (true);
CREATE POLICY image_editor ON public.image TO superadmin USING (true) WITH CHECK (true);
NOTIFY pgrst, 'reload schema';
COMMIT;
