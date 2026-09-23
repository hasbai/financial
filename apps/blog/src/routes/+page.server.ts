import { pageNumber } from "$lib/content";
import { error } from "@sveltejs/kit";
import { publicRepository } from "$lib/public-api";
export async function load({ url }: { url: URL }) {
  const page = pageNumber(url.searchParams.get("page"));
  try {
    const rows = await publicRepository().articles({ page });
    return { articles: rows.slice(0, 12), more: rows.length > 12, page };
  } catch {
    error(503, "文章暂时无法加载");
  }
}
