import { redirect } from "@sveltejs/kit";
import { articlePath } from "$lib/content";
import { loadArticle } from "$lib/load-article";
import { publicRepository } from "$lib/public-api";

export async function load({ params }: { params: { title: string } }) {
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(params.title)) {
    const article = await publicRepository().article(params.title);
    if (article?.status === "published" && article.published_at && new Date(article.published_at) <= new Date())
      redirect(308, articlePath(article));
  }
  return loadArticle(params.title);
}
