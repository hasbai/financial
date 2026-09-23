import { z } from "zod";

export const site = { name: "北极手记", origin: "https://hasbai.xyz" };
export type Tag = { id: string; name: string; slug: string };
export type ImageRecord = {
  id: string;
  name: string;
  sha256: string;
  content_type: string;
  size: number;
  ready: boolean;
};
export type Content = {
  id: string;
  kind: "article" | "note";
  excerpt: string;
  markdown: string;
  cover_id: string | null;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
};
export type Article = Content & {
  kind: "article";
  sequence: number;
  title: string;
  slug: string;
  legacy_path: string | null;
};
export type Note = Content & {
  kind: "note";
  sequence: number;
};
export type Writing = Article | Note;

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,159}$/, "网址只使用小写字母、数字和连字符");
const commonFields = {
  excerpt: z.string().max(600),
  markdown: z.string().max(1048576),
  cover_id: z.string().uuid().nullable(),
  status: z.enum(["draft", "published"]),
  published_at: z.string().nullable(),
};
function publicationCheck(
  value: { status: "draft" | "published"; markdown: string; published_at: string | null },
  ctx: z.RefinementCtx,
) {
  if (value.status === "published" && (!value.markdown.trim() || !value.published_at))
    ctx.addIssue({ code: "custom", message: "发布前请填写正文", path: ["markdown"] });
}
export const articleSchema = z
  .object({
    title: z.string().trim().min(1, "请填写标题").max(240),
    slug: slugSchema,
    tag_ids: z.array(z.string().uuid()).max(30),
    ...commonFields,
  })
  .superRefine(publicationCheck);
export const noteSchema = z.object(commonFields).superRefine(publicationCheck);

export function articlePath(article: Pick<Article, "slug">) {
  return `/articles/${encodeURIComponent(article.slug)}`;
}
export function notePath(note: Pick<Note, "sequence">) {
  return `/notes/${note.sequence}`;
}
export function writingPath(writing: Writing) {
  return writing.kind === "article" ? articlePath(writing) : notePath(writing);
}
export function imagePath(id: string) {
  return `/images/${encodeURIComponent(id)}`;
}
export function dateLabel(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(value))
    : "草稿";
}
export function yearLabel(value: string | null) {
  return value ? new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric" }).format(new Date(value)) : "草稿";
}
export function readMinutes(markdown: string) {
  return Math.max(1, Math.ceil(markdown.replace(/\s/g, "").length / 450));
}
export function excerptFromMarkdown(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[#>*`\-\s]+/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}
export function pageNumber(value: string | null) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(1, Math.min(10000, Math.floor(number)))
    : 1;
}
