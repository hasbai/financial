import { error, redirect } from "@sveltejs/kit";
import { articlePath } from "$lib/content";
import { publicRepository } from "$lib/public-api";

export async function load({ params }: { params: { category: string; title: string } }) {
  const article = await publicRepository().articleByLegacyPath(`/${params.category}/${params.title}`);
  if (!article) error(404, "文章不存在");
  redirect(308, articlePath(article));
}
