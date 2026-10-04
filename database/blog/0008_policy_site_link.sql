-- Correct the site's Markdown link without replacing edited policy content.
BEGIN;
UPDATE public.page
SET markdown = replace(markdown, '（Hasbai，https://hasbai.xyz）', '（Hasbai，[hasbai.xyz](https://hasbai.xyz)）'), updated_at = now()
WHERE slug = 'privacy' AND markdown LIKE '%（Hasbai，https://hasbai.xyz）%';
COMMIT;
