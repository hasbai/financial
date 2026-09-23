import { error } from "@sveltejs/kit";
import { pageNumber } from "$lib/content";
import { publicRepository } from "$lib/public-api";

export async function load({ url }: { url: URL }) {
  try {
    const page = pageNumber(url.searchParams.get("page"));
    const repo = publicRepository();
    const [rows, tags] = await Promise.all([repo.articles({ page }), repo.tags()]);
    return { articles: rows.slice(0, 12), more: rows.length > 12, page, tags };
  } catch {
    error(503, "文章暂时无法加载");
  }
}
