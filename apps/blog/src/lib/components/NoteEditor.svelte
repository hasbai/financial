<script lang="ts">
  import { getContext, onMount } from "svelte";
  import { beforeNavigate, goto } from "$app/navigation";
  import type { BlogAuth } from "$lib/auth.svelte";
  import { repository } from "$lib/api";
  import { excerptFromMarkdown, imagePath, notePath, type Note } from "$lib/content";
  import MarkdownEditor from "./MarkdownEditor.svelte";
  import { Button } from "@hasbai/ui/button";
  import { ArrowLeft, ArrowUpRight, ImagePlus, X } from "@lucide/svelte";

  let { id }: { id?: string } = $props();
  const auth = getContext<BlogAuth>("blog-auth");
  const api = repository(auth.token);
  let original = $state<Note>();
  let markdown = $state("");
  let coverId = $state<string | null>(null);
  let status = $state<"draft" | "published">("draft");
  let publishedAt = $state<string | null>(null);
  let loading = $state(true);
  let saving = $state(false);
  let uploading = $state(false);
  let error = $state("");
  let notice = $state("");
  let baseline = $state("");
  let deleting = $state(false);
  let coverInput = $state<HTMLInputElement>();
  const payload = () => ({
    excerpt: excerptFromMarkdown(markdown), markdown, cover_id: coverId,
    status, published_at: publishedAt,
  });
  const dirty = $derived(!loading && baseline !== JSON.stringify(payload()));
  beforeNavigate(({ cancel }) => {
    if ((dirty || saving || uploading) && !confirm("离开并放弃未保存的修改？")) cancel();
  });
  function beforeUnload(event: BeforeUnloadEvent) {
    if (dirty || saving || uploading) { event.preventDefault(); event.returnValue = ""; }
  }
  async function load() {
    loading = true;
    error = "";
    try {
      if (id) {
        const note = await api.note(id);
        if (!note) throw new Error("手记不存在或无操作权限");
        original = note;
        markdown = note.markdown;
        coverId = note.cover_id;
        status = note.status;
        publishedAt = note.published_at;
      }
      baseline = JSON.stringify(payload());
    } catch (e) { error = e instanceof Error ? e.message : "加载失败"; }
    finally { loading = false; }
  }
  onMount(() => { void load(); });
  async function save(nextStatus: "draft" | "published") {
    if (saving || uploading) return;
    saving = true; error = ""; notice = "";
    const previousStatus = status;
    const previousPublished = publishedAt;
    status = nextStatus;
    if (status === "published" && !publishedAt) publishedAt = new Date().toISOString();
    try {
      const note = await api.saveNote(payload(), original?.id, original?.updated_at);
      original = note;
      baseline = JSON.stringify(payload());
      notice = status === "published" ? "已发布" : "草稿已保存";
      saving = false;
      if (!id) await goto("/studio/notes/" + note.id, { replaceState: true });
    } catch (e) {
      status = previousStatus;
      publishedAt = previousPublished;
      error = e instanceof Error ? e.message : "保存失败";
    } finally { saving = false; }
  }
  async function uploadCover(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    uploading = true; error = "";
    try {
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
      coverId = result.id;
    } catch (e) { error = e instanceof Error ? e.message : "上传失败"; }
    finally { uploading = false; if (coverInput) coverInput.value = ""; }
  }
  async function remove() {
    if (!original || saving) return;
    saving = true; error = "";
    try {
      await api.remove("note", original.id, original.updated_at);
      baseline = JSON.stringify(payload());
      saving = false;
      await goto("/studio");
    } catch (e) { error = e instanceof Error ? e.message : "删除失败"; saving = false; }
  }
</script>

<svelte:window onbeforeunload={beforeUnload} />
<svelte:head><title>{original ? `手记 №${original.sequence}` : "新手记"} · 编辑室</title></svelte:head>
<section class="wrap py-8">
  <div class="flex flex-wrap items-center justify-between gap-4 pb-6">
    <Button variant="ghost" href="/studio"><ArrowLeft size={16} />编辑室</Button>
    <div class="flex flex-wrap items-center gap-2">
      <span class="meta" role="status">{saving ? "正在保存…" : dirty ? "未保存" : notice || (status === "published" ? "已发布" : "草稿")}</span>
      {#if original?.status === "published"}<Button variant="ghost" href={notePath(original)} target="_blank">查看<ArrowUpRight size={16} /></Button>{/if}
      <Button variant="outline" disabled={loading || saving || uploading} onclick={() => save("draft")}>{status === "published" ? "撤回为草稿" : "保存草稿"}</Button>
      <Button disabled={loading || saving || uploading} onclick={() => save("published")}>{status === "published" ? "更新手记" : "发布手记"}</Button>
    </div>
  </div>
  {#if loading}<div class="empty" role="status">正在打开手记…</div>
  {:else if error && !baseline}<div class="empty"><p class="error" role="alert">{error}</p><Button onclick={load}>重试</Button></div>
  {:else}
    {#if error}<p class="error my-5" role="alert">{error}</p>{/if}
    <div class="grid items-start gap-12 py-8 lg:grid-cols-[minmax(0,1fr)_248px]">
      <div class="min-w-0">
        <span class="eyebrow">LETTER {original ? `№${original.sequence}` : "/ NEW"}</span>
        <h1 class="serif mt-4 text-4xl">手记</h1>
        <div class="mt-7"><MarkdownEditor bind:value={markdown} bind:busy={uploading} upload={async (file) => {
          if (file.size > 10 * 1024 * 1024) throw new Error("图片不能超过 10 MB");
          const response = await fetch("/api/images", { method: "POST", headers: { Authorization: "Bearer " + (await auth.token()), "Content-Type": file.type, "X-Image-Name": encodeURIComponent(file.name) }, body: file });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || "上传失败");
          return { src: imagePath(result.id), name: result.name, id: result.id };
        }} disabled={saving} /></div>
      </div>
      <aside class="space-y-6 lg:sticky lg:top-8">
        <h2 class="serif text-xl">出版信息</h2>
        <div class="field"><span class="text-sm font-medium">封面</span>
          {#if coverId}<img class="cover" src={imagePath(coverId)} alt="手记封面" /><Button variant="ghost" disabled={saving} onclick={() => (coverId = null)}><X size={16} />移除封面</Button>{/if}
          <input bind:this={coverInput} type="file" class="hidden" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="封面图片" onchange={uploadCover} />
          <Button variant="outline" disabled={saving || uploading} onclick={() => coverInput?.click()}><ImagePlus size={16} />{uploading ? "正在上传…" : "上传封面"}</Button>
        </div>
        {#if original}<div>{#if deleting}<p class="mb-3 text-sm">删除这则手记？</p><div class="flex gap-2"><Button variant="destructive" disabled={saving} onclick={remove}>确认删除</Button><Button variant="ghost" disabled={saving} onclick={() => (deleting = false)}>取消</Button></div>{:else}<Button variant="ghost" class="text-destructive" disabled={saving} onclick={() => (deleting = true)}>删除手记</Button>{/if}</div>{/if}
      </aside>
    </div>
  {/if}
</section>
