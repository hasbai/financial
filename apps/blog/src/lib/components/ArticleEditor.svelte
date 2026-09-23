<script lang="ts">
  import { getContext, onMount } from "svelte";
  import { beforeNavigate, goto } from "$app/navigation";
  import type { BlogAuth } from "$lib/auth.svelte";
  import { repository } from "$lib/api";
  import {
    articlePath,
    imagePath,
    type Article,
    type Category,
    type Tag,
  } from "$lib/content";
  import MarkdownEditor from "./MarkdownEditor.svelte";
  import { Button } from "@hasbai/ui/button";
  import { Input } from "@hasbai/ui/input";
  import { Textarea } from "@hasbai/ui/textarea";
  import { ArrowLeft, ArrowUpRight, ImagePlus, X } from "@lucide/svelte";
  let { id }: { id?: string } = $props();
  const auth = getContext<BlogAuth>("blog-auth");
  const api = repository(auth.token);
  let original = $state<Article>();
  let title = $state("");
  let slug = $state("");
  let excerpt = $state("");
  let markdown = $state("");
  let categoryId = $state("");
  let tagIds = $state<string[]>([]);
  let coverId = $state<string | null>(null);
  let status = $state<"draft" | "published">("draft");
  let publishedAt = $state<string | null>(null);
  let categories = $state<Category[]>([]);
  let tags = $state<Tag[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let uploading = $state(false);
  let error = $state("");
  let notice = $state("");
  let baseline = $state("");
  let termType = $state<"category" | "tag" | "">("");
  let termName = $state("");
  let termSlug = $state("");
  let deleting = $state(false);
  let coverInput: HTMLInputElement;
  const payload = () => ({
    title,
    slug,
    excerpt,
    markdown,
    category_id: categoryId,
    tag_ids: tagIds,
    cover_id: coverId,
    status,
    published_at: publishedAt,
  });
  const dirty = $derived(!loading && baseline !== JSON.stringify(payload()));
  beforeNavigate(({ cancel }) => {
    if ((dirty || saving || uploading) && !confirm("离开并放弃未保存的修改？"))
      cancel();
  });
  function beforeUnload(event: BeforeUnloadEvent) {
    if (dirty || saving || uploading) {
      event.preventDefault();
      event.returnValue = "";
    }
  }
  async function load() {
    loading = true;
    error = "";
    try {
      [categories, tags] = await Promise.all([api.categories(), api.tags()]);
      if (id) {
        const article = await api.article(id);
        if (!article) throw new Error("文章不存在或无操作权限");
        original = article;
        title = article.title;
        slug = article.slug;
        excerpt = article.excerpt;
        markdown = article.markdown;
        categoryId = article.category_id;
        tagIds = article.tag_ids;
        coverId = article.cover_id;
        status = article.status;
        publishedAt = article.published_at;
      } else categoryId = categories[0]?.id ?? "";
      baseline = JSON.stringify(payload());
    } catch (e) {
      error = e instanceof Error ? e.message : "加载失败";
    } finally {
      loading = false;
    }
  }
  onMount(() => {
    void load();
  });
  async function save(nextStatus: "draft" | "published") {
    if (saving || uploading) return;
    saving = true;
    error = "";
    notice = "";
    const previousStatus = status;
    const previousPublished = publishedAt;
    status = nextStatus;
    if (status === "published" && !publishedAt)
      publishedAt = new Date().toISOString();
    try {
      const article = await api.save(
        payload(),
        original?.id,
        original?.updated_at,
      );
      original = article;
      baseline = JSON.stringify(payload());
      notice = status === "published" ? "已发布" : "草稿已保存";
      saving = false;
      if (!id) await goto("/studio/" + article.id, { replaceState: true });
    } catch (e) {
      status = previousStatus;
      publishedAt = previousPublished;
      error = e instanceof Error ? e.message : "保存失败";
    } finally {
      saving = false;
    }
  }
  async function upload(file: File) {
    if (file.size > 10 * 1024 * 1024) throw new Error("图片不能超过 10 MB");
    const response = await fetch("/api/images", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + (await auth.token()),
        "Content-Type": file.type,
        "X-Image-Name": encodeURIComponent(file.name),
      },
      body: file,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "上传失败");
    return { src: imagePath(result.id), name: result.name, id: result.id };
  }
  async function uploadCover(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    uploading = true;
    error = "";
    try {
      coverId = (await upload(file)).id;
    } catch (e) {
      error = e instanceof Error ? e.message : "上传失败";
    } finally {
      uploading = false;
      coverInput.value = "";
    }
  }
  async function createTerm() {
    saving = true;
    error = "";
    try {
      if (!termType) return;
      const term = await api.createTerm(termType, termName, termSlug);
      if (termType === "category") {
        categories = [...categories, term];
        categoryId = term.id;
      } else {
        tags = [...tags, term];
        tagIds = [...tagIds, term.id];
      }
      termType = "";
      termName = "";
      termSlug = "";
    } catch (e) {
      error = e instanceof Error ? e.message : "保存失败";
    } finally {
      saving = false;
    }
  }
  async function remove() {
    if (!original || saving) return;
    saving = true;
    error = "";
    try {
      await api.remove(original.id, original.updated_at);
      baseline = JSON.stringify(payload());
      saving = false;
      await goto("/studio");
    } catch (e) {
      error = e instanceof Error ? e.message : "删除失败";
      saving = false;
    }
  }
</script>

<svelte:window onbeforeunload={beforeUnload} /><svelte:head
  ><title>{title || "新文章"} · 编辑室</title></svelte:head
>
<section class="wrap py-8">
  <div class="flex flex-wrap items-center justify-between gap-4 border-b pb-6">
    <Button variant="ghost" href="/studio"><ArrowLeft size={16} />编辑室</Button
    >
    <div class="flex flex-wrap items-center gap-2">
      <span class="meta" role="status"
        >{saving
          ? "正在保存…"
          : dirty
            ? "未保存"
            : notice || (status === "published" ? "已发布" : "草稿")}</span
      >{#if original?.status === "published"}<Button
          variant="ghost"
          href={articlePath(original)}
          target="_blank">查看<ArrowUpRight size={16} /></Button
        >{/if}<Button
        variant="outline"
        disabled={loading || saving || uploading}
        onclick={() => save("draft")}
        >{status === "published" ? "撤回为草稿" : "保存草稿"}</Button
      ><Button
        disabled={loading || saving || uploading}
        onclick={() => save("published")}
        >{status === "published" ? "更新文章" : "发布文章"}</Button
      >
    </div>
  </div>
  {#if loading}<div class="empty" role="status">
      正在打开文章…
    </div>{:else if error && !baseline}<div class="empty">
      <p class="error" role="alert">{error}</p>
      <Button onclick={load}>重试</Button>
    </div>{:else}
    {#if error}<p class="error my-5" role="alert">{error}</p>{/if}
    <div
      class="grid items-start gap-12 py-8 lg:grid-cols-[minmax(0,1fr)_248px]"
    >
      <div class="min-w-0">
        <label for="article-title" class="sr-only">标题</label><textarea
          id="article-title"
          class="serif min-h-30 w-full resize-y border-0 bg-transparent text-4xl leading-snug outline-none sm:text-5xl"
          placeholder="写下标题"
          bind:value={title}
          disabled={saving}
          maxlength="240"
        />
        <div class="mt-6">
          <MarkdownEditor
            bind:value={markdown}
            bind:busy={uploading}
            {upload}
            disabled={saving}
          />
        </div>
      </div>
      <aside class="space-y-6 lg:sticky lg:top-8">
        <h2 class="serif border-b pb-4 text-xl">出版信息</h2>
        <div class="field">
          <label for="slug">文章网址</label><Input
            id="slug"
            bind:value={slug}
            placeholder="hello-world"
            disabled={saving}
          />
        </div>
        <div class="field">
          <label for="category">分类</label><select
            id="category"
            bind:value={categoryId}
            disabled={saving}
            ><option value="" disabled>选择分类</option
            >{#each categories as category}<option value={category.id}
                >{category.name}</option
              >{/each}</select
          ><Button
            variant="ghost"
            class="justify-start px-0"
            onclick={() =>
              (termType = termType === "category" ? "" : "category")}
            disabled={saving}>＋ 新建分类</Button
          >
        </div>
        <div class="field">
          <label for="excerpt">摘要</label><Textarea
            id="excerpt"
            bind:value={excerpt}
            rows={4}
            maxlength={600}
            disabled={saving}
          />
        </div>
        <fieldset class="space-y-3">
          <legend class="text-sm font-medium">标签</legend>
          <div class="flex flex-wrap gap-2">
            {#each tags as tag}<label
                class="flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm"
                ><input
                  type="checkbox"
                  value={tag.id}
                  bind:group={tagIds}
                  disabled={saving}
                />{tag.name}</label
              >{/each}
          </div>
          <Button
            variant="ghost"
            class="justify-start px-0"
            onclick={() => (termType = termType === "tag" ? "" : "tag")}
            disabled={saving}>＋ 新建标签</Button
          >
        </fieldset>
        {#if termType}<div class="space-y-3 rounded-2xl border p-4">
            <h3 class="text-sm">
              新建{termType === "category" ? "分类" : "标签"}
            </h3>
            <Input
              aria-label="名称"
              bind:value={termName}
              placeholder="名称"
              disabled={saving}
            /><Input
              aria-label="网址标识"
              bind:value={termSlug}
              placeholder="notes"
              disabled={saving}
            />
            <div class="flex gap-2">
              <Button
                disabled={saving || !termName.trim() || !termSlug}
                onclick={createTerm}>保存</Button
              ><Button
                variant="ghost"
                disabled={saving}
                onclick={() => (termType = "")}>取消</Button
              >
            </div>
          </div>{/if}
        <div class="field">
          <span class="text-sm font-medium">封面</span>{#if coverId}<img
              class="cover"
              src={imagePath(coverId)}
              alt="文章封面"
            /><Button
              variant="ghost"
              disabled={saving}
              onclick={() => (coverId = null)}><X size={16} />移除封面</Button
            >{/if}<input
            bind:this={coverInput}
            type="file"
            class="hidden"
            accept="image/png,image/jpeg,image/webp,image/gif"
            aria-label="封面图片"
            onchange={uploadCover}
          /><Button
            variant="outline"
            disabled={saving || uploading}
            onclick={() => coverInput.click()}
            ><ImagePlus size={16} />{uploading
              ? "正在上传…"
              : "上传封面"}</Button
          >
        </div>
        {#if original}<div class="border-t pt-6">
            {#if deleting}<p class="mb-3 text-sm">删除这篇文章？</p>
              <div class="flex gap-2">
                <Button variant="destructive" disabled={saving} onclick={remove}
                  >确认删除</Button
                ><Button
                  variant="ghost"
                  disabled={saving}
                  onclick={() => (deleting = false)}>取消</Button
                >
              </div>{:else}<Button
                variant="ghost"
                class="text-destructive"
                disabled={saving}
                onclick={() => (deleting = true)}>删除文章</Button
              >{/if}
          </div>{/if}
      </aside>
    </div>{/if}
</section>
