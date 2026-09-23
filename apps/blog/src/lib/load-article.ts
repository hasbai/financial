import { error } from "@sveltejs/kit";
import { publicRepository } from "./public-api";
import { renderMarkdown } from "./markdown";
export async function loadArticle(
  key: { id: string } | { category: string; title: string },
) {
  const repo = publicRepository();
  const article =
    "id" in key
      ? /^[0-9a-f-]{36}$/i.test(key.id)
        ? await repo.article(key.id)
        : null
      : await repo.articleBySlug(key.category, key.title);
  if (
    !article ||
    article.status !== "published" ||
    !article.published_at ||
    new Date(article.published_at) > new Date()
  )
    error(404, "文章不存在");
  const tags = await repo.tags();
  return {
    article,
    html: await renderMarkdown(article.markdown),
    tags: tags.filter((t) => article.tag_ids.includes(t.id)),
  };
}
