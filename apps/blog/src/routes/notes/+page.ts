import { error } from "@sveltejs/kit";
import { pageNumber } from "$lib/content";
import { publicRepository } from "$lib/public-api";

export async function load({ url }: { url: URL }) {
  try {
    const page = pageNumber(url.searchParams.get("page"));
    const rows = await publicRepository().notes({ page });
    return { notes: rows.slice(0, 12), more: rows.length > 12, page };
  } catch {
    error(503, "手记暂时无法加载");
  }
}
