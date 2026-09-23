import { z } from "zod";
export const site = { name: "北极手记", origin: "https://hasbai.xyz" };
export type Category = { id: string; name: string; slug: string };
export type Tag = Category;
export type ImageRecord = {
  id: string;
  name: string;
  sha256: string;
  content_type: string;
  size: number;
  ready: boolean;
};
export type Article = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  markdown: string;
  category_id: string;
  category: Category;
  tag_ids: string[];
  cover_id: string | null;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
};
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,159}$/, "网址只使用小写字母、数字和连字符");
export const articleSchema = z
  .object({
    title: z.string().trim().min(1, "请填写标题").max(240),
    slug: slugSchema,
    excerpt: z.string().max(600),
    markdown: z.string().max(1048576),
    category_id: z.string().uuid("请选择分类"),
    tag_ids: z.array(z.string().uuid()).max(30),
    cover_id: z.string().uuid().nullable(),
    status: z.enum(["draft", "published"]),
    published_at: z.string().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.status === "published" && (!v.markdown.trim() || !v.published_at))
      ctx.addIssue({
        code: "custom",
        message: "发布前请填写正文",
        path: ["markdown"],
      });
  });
export function articlePath(article: Pick<Article, "slug" | "category">) {
  return `/${encodeURIComponent(article.category.slug)}/${encodeURIComponent(article.slug)}`;
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
export function readMinutes(markdown: string) {
  return Math.max(1, Math.ceil(markdown.replace(/\s/g, "").length / 450));
}

export function pageNumber(value: string | null) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(1, Math.min(10000, Math.floor(number)))
    : 1;
}
