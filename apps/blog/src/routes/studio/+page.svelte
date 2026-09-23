<script lang="ts">
  import { getContext, onMount } from "svelte";
  import type { BlogAuth } from "$lib/auth.svelte";
  import { repository } from "$lib/api";
  import { dateLabel, type Article } from "$lib/content";
  import { Button } from "@hasbai/ui/button";
  import { Badge } from "@hasbai/ui/badge";
  import { Plus, ArrowUpRight } from "@lucide/svelte";
  const auth = getContext<BlogAuth>("blog-auth");
  let rows = $state<Article[]>([]);
  let loading = $state(true);
  let error = $state("");
  let current = $state(1);
  let more = $state(false);
  async function load() {
    loading = true;
    error = "";
    try {
      const data = await repository(auth.token).articles({
        studio: true,
        page: current,
      });
      rows = data.slice(0, 12);
      more = data.length > 12;
    } catch {
      error = "文章加载失败，请重试";
    } finally {
      loading = false;
    }
  }
  onMount(() => {
    void load();
  });
</script>

<svelte:head><title>编辑室 · 北极手记</title></svelte:head>
<section class="wrap">
  <div class="edition">
    <div>
      <span class="meta">THE WRITING ROOM</span>
      <h1 class="mt-4">编辑室</h1>
    </div>
    <Button href="/studio/new"><Plus size={16} />新文章</Button>
  </div>
  <div class="mb-8 flex justify-between border-b pb-4">
    <span class="text-sm">文章</span><Button
      variant="ghost"
      onclick={() => auth.logout()}>退出登录</Button
    >
  </div>
  {#if loading}<div class="empty" role="status">
      正在加载…
    </div>{:else if error}<div class="empty">
      <p role="alert" class="error">{error}</p>
      <Button onclick={load}>重试</Button>
    </div>{:else if !rows.length}<div class="empty">
      <h2 class="serif text-3xl">从第一篇开始</h2>
      <Button href="/studio/new">开始写作</Button>
    </div>{:else}{#each rows as article}<a
        class="flex items-center justify-between gap-6 border-b py-6"
        href={"/studio/" + article.id}
        ><div class="min-w-0">
          <div class="mb-2 flex items-center gap-3">
            <Badge
              variant={article.status === "published" ? "secondary" : "outline"}
              >{article.status === "published" ? "已发布" : "草稿"}</Badge
            ><span class="meta">{article.category.name}</span>
          </div>
          <h2 class="serif break-words text-2xl">{article.title}</h2>
          <p class="meta mt-3">{dateLabel(article.updated_at)}</p>
        </div>
        <ArrowUpRight class="shrink-0" /></a
      >{/each}
    <div class="mt-6 flex justify-between">
      <Button
        variant="outline"
        disabled={current === 1}
        onclick={() => {
          current--;
          void load();
        }}>上一页</Button
      ><Button
        variant="outline"
        disabled={!more}
        onclick={() => {
          current++;
          void load();
        }}>下一页</Button
      >
    </div>{/if}
</section>
