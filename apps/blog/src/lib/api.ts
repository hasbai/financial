import { env } from "$env/dynamic/public";
import { createDataClient, dataApiUrl } from "@hasbai/data";
import type { Article, Category, Tag } from "./content";
import { articleSchema } from "./content";
export function repository(
  token?: () => Promise<string>,
  url = env.PUBLIC_DATA_API_URL || dataApiUrl,
) {
  const db = createDataClient(url, "public", token);
  async function read<T>(
    query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  ): Promise<T> {
    let result;
    try {
      result = await query;
    } catch (cause) {
      if (url.startsWith("http://127.0.0.1:") && cause instanceof Error) {
        console.error("Blog fixture API fetch failed", {
          endpoint: url,
          cause: cause.cause,
        });
      }
      throw cause;
    }
    if (result.error) throw new Error(result.error.message);
    return result.data as T;
  }
  return {
    db,
    categories: () =>
      read<Category[]>(db.from("category").select("*").order("name")),
    tags: () => read<Tag[]>(db.from("tag").select("*").order("name")),
    async articles({
      category,
      tag,
      page = 1,
      studio = false,
    }: {
      category?: string;
      tag?: string;
      page?: number;
      studio?: boolean;
    } = {}) {
      let q = db
        .from("article")
        .select("*,category:category_id(id,name,slug)")
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("id");
      if (!studio)
        q = q
          .eq("status", "published")
          .lte("published_at", new Date().toISOString());
      if (category) q = q.eq("category_id", category);
      if (tag) q = q.contains("tag_ids", [tag]);
      return read<Article[]>(q.range((page - 1) * 12, page * 12));
    },
    article: (id: string) =>
      read<Article | null>(
        db
          .from("article")
          .select("*,category:category_id(id,name,slug)")
          .eq("id", id)
          .maybeSingle(),
      ),
    articleBySlug: (category: string, slug: string) =>
      read<Article | null>(
        db
          .from("article")
          .select("*,category:category_id!inner(id,name,slug)")
          .eq("category.slug", category)
          .eq("slug", slug)
          .eq("status", "published")
          .lte("published_at", new Date().toISOString())
          .maybeSingle(),
      ),
    async save(value: unknown, id?: string, updatedAt?: string) {
      const payload = {
        ...articleSchema.parse(value),
        updated_at: new Date().toISOString(),
      };
      const q = id
        ? db
            .from("article")
            .update(payload)
            .eq("id", id)
            .eq("updated_at", updatedAt!)
            .select("*,category:category_id(id,name,slug)")
        : db
            .from("article")
            .insert(payload)
            .select("*,category:category_id(id,name,slug)");
      const rows = await read<Article[]>(q);
      if (!rows.length) throw new Error("文章已被更新，请重新打开后编辑");
      return rows[0];
    },
    async remove(id: string, updatedAt: string) {
      const rows = await read<{ id: string }[]>(
        db
          .from("article")
          .delete()
          .eq("id", id)
          .eq("updated_at", updatedAt)
          .select("id"),
      );
      if (!rows.length) throw new Error("文章已被更新，请重新打开");
    },
    createTerm: (table: "category" | "tag", name: string, slug: string) =>
      read<Category>(
        db.from(table).insert({ name: name.trim(), slug }).select("*").single(),
      ),
  };
}
