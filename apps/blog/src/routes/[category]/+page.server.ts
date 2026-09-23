import { pageNumber } from "$lib/content";
import { error } from "@sveltejs/kit";
import { publicRepository } from "$lib/public-api";
export async function load({
  params,
  url,
}: {
  params: { category: string };
  url: URL;
}) {
  const repo = publicRepository();
  const categories = await repo.categories();
  const category = categories.find((c) => c.slug === params.category);
  if (!category) error(404, "分类不存在");
  const page = pageNumber(url.searchParams.get("page"));
  const rows = await repo.articles({ category: category.id, page });
  return {
    articles: rows.slice(0, 12),
    more: rows.length > 12,
    page,
    category,
  };
}
