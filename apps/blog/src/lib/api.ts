import { env } from "$env/dynamic/public";
import { createDataClient, dataApiUrl } from "@hasbai/data";
import type { Article, Content, Note, Tag } from "./content";
import { articleSchema, noteSchema } from "./content";

const articleSummary =
  "id,kind,sequence,title,slug,legacy_path,excerpt,cover_id,status,published_at,created_at,updated_at";
const noteSummary =
  "id,kind,sequence,excerpt,cover_id,status,published_at,created_at,updated_at";

export function repository(
  token?: () => Promise<string>,
  url = env.PUBLIC_DATA_API_URL || dataApiUrl,
) {
  const db = createDataClient(url, "public", token);
  async function read<T>(
    query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  ): Promise<T> {
    const result = await query;
    if (result.error) throw new Error(result.error.message);
    return result.data as T;
  }

  return {
    db,
    tags: () => read<Tag[]>(db.from("tag").select("id,name,slug").order("name")),
    async articles({
      tag,
      page = 1,
      limit = 12,
      studio = false,
    }: { tag?: string; page?: number; limit?: number; studio?: boolean } = {}) {
      let q = db
        .from("article")
        .select(articleSummary)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("id");
      if (!studio)
        q = q
          .eq("status", "published")
          .lte("published_at", new Date().toISOString());
      if (tag) {
        const links = await read<{ article_id: string }[]>(
          db.from("article_tag").select("article_id").eq("tag_id", tag),
        );
        if (!links.length) return [] as Article[];
        q = q.in(
          "id",
          links.map((link) => link.article_id),
        );
      }
      return read<Article[]>(q.range((page - 1) * limit, page * limit));
    },
    async notes({ page = 1, limit = 12, studio = false }: { page?: number; limit?: number; studio?: boolean } = {}) {
      let q = db
        .from("note")
        .select(noteSummary)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("id");
      if (!studio)
        q = q
          .eq("status", "published")
          .lte("published_at", new Date().toISOString());
      return read<Note[]>(q.range((page - 1) * limit, page * limit));
    },
    content: (id: string) =>
      read<Content | null>(
        db
          .from("content")
          .select("id,kind,excerpt,markdown,cover_id,status,published_at,created_at,updated_at")
          .eq("id", id)
          .maybeSingle(),
      ),
    article: (id: string) =>
      read<Article | null>(
        db.from("article").select("*").eq("id", id).maybeSingle(),
      ),
    articleBySlug: (slug: string) =>
      read<Article | null>(
        db
          .from("article")
          .select("*")
          .eq("slug", slug)
          .eq("status", "published")
          .lte("published_at", new Date().toISOString())
          .maybeSingle(),
      ),
    articleByLegacyPath: (path: string) =>
      read<Article | null>(
        db
          .from("article")
          .select("*")
          .eq("legacy_path", path)
          .eq("status", "published")
          .lte("published_at", new Date().toISOString())
          .maybeSingle(),
      ),
    note: (id: string) =>
      read<Note | null>(db.from("note").select("*").eq("id", id).maybeSingle()),
    noteBySequence: (sequence: number) =>
      read<Note | null>(
        db
          .from("note")
          .select("*")
          .eq("sequence", sequence)
          .eq("status", "published")
          .lte("published_at", new Date().toISOString())
          .maybeSingle(),
      ),
    tagsForArticle: async (id: string) => {
      const [links, tags] = await Promise.all([
        read<{ tag_id: string }[]>(
          db.from("article_tag").select("tag_id").eq("article_id", id),
        ),
        read<Tag[]>(db.from("tag").select("id,name,slug").order("name")),
      ]);
      const ids = new Set(links.map((link) => link.tag_id));
      return tags.filter((tag) => ids.has(tag.id));
    },
    async saveArticle(value: unknown, id?: string, updatedAt?: string) {
      const { tag_ids, ...fields } = articleSchema.parse(value);
      return read<Article>(
        db.rpc("save_article", {
          p_id: id ?? crypto.randomUUID(),
          p_updated_at: updatedAt ?? null,
          p_title: fields.title,
          p_slug: fields.slug,
          p_excerpt: fields.excerpt,
          p_markdown: fields.markdown,
          p_cover_id: fields.cover_id,
          p_status: fields.status,
          p_published_at: fields.published_at,
          p_tag_ids: tag_ids,
        }).single(),
      );
    },
    async saveNote(value: unknown, id?: string, updatedAt?: string) {
      const fields = noteSchema.parse(value);
      const payload = {
        ...fields,
        updated_at: new Date().toISOString(),
        ...(id ? {} : { id: crypto.randomUUID() }),
      };
      const q = id
        ? db
            .from("note")
            .update(payload)
            .eq("id", id)
            .eq("updated_at", updatedAt!)
            .select("*")
        : db.from("note").insert(payload).select("*");
      const rows = await read<Note[]>(q);
      if (!rows.length) throw new Error("手记已被更新，请重新打开后编辑");
      return rows[0];
    },
    async remove(kind: "article" | "note", id: string, updatedAt: string) {
      const rows = await read<{ id: string }[]>(
        db
          .from(kind)
          .delete()
          .eq("id", id)
          .eq("updated_at", updatedAt)
          .select("id"),
      );
      if (!rows.length) throw new Error("内容已被更新，请重新打开");
    },
    createTag: (name: string, slug: string) =>
      read<Tag>(
        db
          .from("tag")
          .insert({ name: name.trim(), slug })
          .select("*")
          .single(),
      ),
  };
}
