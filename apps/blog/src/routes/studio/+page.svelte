<script lang="ts">
  import { getContext, onMount } from "svelte";
  import type { BlogAuth } from "$lib/auth.svelte";
  import { repository } from "$lib/api";
  import { dateLabel, type Writing } from "$lib/content";
  import { Button } from "@hasbai/ui/button";
  import { Badge } from "@hasbai/ui/badge";
  import { Plus, ArrowUpRight } from "@lucide/svelte";
  const auth = getContext<BlogAuth>("blog-auth");
  let rows = $state<Writing[]>([]);
  let kind = $state<"article" | "note">("article");
  let loading = $state(true);
  let error = $state("");
  let current = $state(1);
  let more = $state(false);
  async function load() {
    loading = true; error = "";
    try {
      const api = repository(auth.token);
      const data = kind === "article"
        ? await api.articles({ studio: true, page: current })
        : await api.notes({ studio: true, page: current });
      rows = data.slice(0, 12);
      more = data.length > 12;
    } catch { error = "内容加载失败，请重试"; }
    finally { loading = false; }
  }
  function select(next: "article" | "note") {
    kind = next; current = 1; void load();
  }
  onMount(() => { void load(); });
</script>

<svelte:head><title>编辑室 · 北极手记</title></svelte:head>
<section class="wrap collection studio-page">
  <div class="collection-heading flex flex-wrap items-end justify-between gap-6">
    <div><span class="eyebrow">THE WRITING ROOM</span><h1 class="serif">编辑室</h1></div>
    <div class="flex flex-wrap gap-2"><Button variant="outline" href="/studio/notes/new"><Plus size={16} />新手记</Button><Button href="/studio/new"><Plus size={16} />新文章</Button></div>
  </div>
  <div class="flex flex-wrap items-center justify-between gap-5">
    <div class="studio-tabs" role="group" aria-label="内容类型">
      <button aria-pressed={kind === "article"} onclick={() => select("article")}>文章</button>
      <button aria-pressed={kind === "note"} onclick={() => select("note")}>手记</button>
    </div>
    <Button variant="ghost" onclick={() => auth.logout()}>退出登录</Button>
  </div>
  {#if loading}<div class="empty" role="status">正在加载…</div>
  {:else if error}<div class="empty"><p role="alert" class="error">{error}</p><Button onclick={load}>重试</Button></div>
  {:else if !rows.length}<div class="empty"><h2 class="serif text-3xl">{kind === "article" ? "从第一篇开始" : "从第一则开始"}</h2><Button href={kind === "article" ? "/studio/new" : "/studio/notes/new"}>开始写作</Button></div>
  {:else}
    <div class="writing-list mt-8">
      {#each rows as writing (writing.id)}
        <a class="studio-row" href={writing.kind === "article" ? "/studio/" + writing.id : "/studio/notes/" + writing.id}>
          <div class="min-w-0"><div class="mb-3 flex items-center gap-3"><Badge variant={writing.status === "published" ? "secondary" : "outline"}>{writing.status === "published" ? "已发布" : "草稿"}</Badge><span class="meta">{dateLabel(writing.updated_at)}</span></div><h2 class="serif break-words text-2xl">{writing.kind === "article" ? writing.title : `手记 №${writing.sequence}`}</h2>{#if writing.kind === "note" && writing.excerpt}<p class="mt-2 text-sm text-muted-foreground">{writing.excerpt}</p>{/if}</div>
          <ArrowUpRight class="shrink-0" size={18} />
        </a>
      {/each}
    </div>
    <div class="pager"><Button variant="ghost" disabled={current === 1} onclick={() => { current--; void load(); }}>← 上一页</Button><span class="meta">{current}</span><Button variant="ghost" disabled={!more} onclick={() => { current++; void load(); }}>下一页 →</Button></div>
  {/if}
</section>
