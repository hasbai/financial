import { pageNumber } from "$lib/content";
import { error } from "@sveltejs/kit";
import { publicRepository } from "$lib/public-api";

export async function load({ params, url }: { params: { tag: string }; url: URL }) {
  const repo = publicRepository();
  const tags = await repo.tags();
  const tag = tags.find((item) => item.slug === params.tag);
  if (!tag) error(404, "标签不存在");
  const page = pageNumber(url.searchParams.get("page"));
  const rows = await repo.articles({ tag: tag.id, page });
  return { articles: rows.slice(0, 12), more: rows.length > 12, page, tag, tags };
}
