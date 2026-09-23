import { error, redirect } from "@sveltejs/kit";
import { articlePath, notePath } from "$lib/content";
import { publicRepository } from "$lib/public-api";

export async function load({ params }: { params: { id: string } }) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(params.id)) error(404, "内容不存在");
  const repo = publicRepository();
  const content = await repo.content(params.id);
  if (!content) error(404, "内容不存在");
  if (content.kind === "article") {
    const article = await repo.article(content.id);
    if (!article) error(404, "内容不存在");
    redirect(308, articlePath(article));
  }
  if (content.kind === "note") {
    const note = await repo.note(content.id);
    if (!note) error(404, "内容不存在");
    redirect(308, notePath(note));
  }
  error(404, "内容不存在");
}
