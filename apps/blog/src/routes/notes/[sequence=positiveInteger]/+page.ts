import { error } from "@sveltejs/kit";
import { publicRepository } from "$lib/public-api";
import { renderMarkdown } from "$lib/markdown";

export async function load({ params }: { params: { sequence: string } }) {
  const sequence = Number(params.sequence);
  if (!Number.isSafeInteger(sequence) || sequence < 1) error(404, "手记不存在");
  const note = await publicRepository().noteBySequence(sequence);
  if (!note) error(404, "手记不存在");
  return { note, html: await renderMarkdown(note.markdown) };
}
