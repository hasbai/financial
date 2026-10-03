-- Correct the public site's name without replacing edited page content.
BEGIN;
UPDATE public.page
SET title = '关于北极小站', updated_at = now()
WHERE slug = 'about' AND title = '关于北极手记';

UPDATE public.page
SET markdown = replace(markdown,
  '北极小站（Hasbai）、北极手记及', '北极小站（Hasbai）及'),
  updated_at = now()
WHERE slug = 'privacy' AND markdown LIKE '%北极小站（Hasbai）、北极手记及%';

UPDATE public.page
SET markdown = replace(markdown, '包括北极手记、', '包括公开博客、'),
  updated_at = now()
WHERE slug = 'terms' AND markdown LIKE '%包括北极手记、%';
COMMIT;
