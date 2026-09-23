import { loadArticle } from "$lib/load-article";
export const load = ({
  params,
}: {
  params: { category: string; title: string };
}) => loadArticle(params);
