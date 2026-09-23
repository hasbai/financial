import { loadArticle } from "$lib/load-article";
export const load = ({ params }: { params: { id: string } }) =>
  loadArticle(params);
