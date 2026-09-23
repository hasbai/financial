<script lang="ts">
  import { articlePath, dateLabel, imagePath, type Article, type Tag } from "$lib/content";
  import { reveal } from "$lib/reveal";
  import { Button } from "@hasbai/ui/button";
  import { ArrowUpRight } from "@lucide/svelte";
  let {
    articles,
    title = "文章",
    tags = [],
    tag,
    page = 1,
    more = false,
  }: { articles: Article[]; title?: string; tags?: Tag[]; tag?: Tag; page?: number; more?: boolean } = $props();
</script>

<section class="wrap collection">
  <div class="collection-heading entrance">
    <span class="eyebrow">WRITING / ARTICLES</span>
    <h1 class="serif">{title}</h1>
    <p>把持续思考的事情，写成完整的一篇。</p>
  </div>
  {#if tags.length}<nav class="tag-filter" aria-label="按标签筛选文章">
      <a href="/articles" aria-current={!tag ? "page" : undefined}>全部</a>
      {#each tags as item}<a href={"/tags/" + item.slug} aria-current={tag?.id === item.id ? "page" : undefined}>{item.name}</a>{/each}
    </nav>{/if}
  {#if articles.length}
    <div class="writing-list">
      {#each articles as article, index (article.id)}
        <article class="writing-row" use:reveal={index}>
          <a class="writing-row-main" href={articlePath(article)}>
            <span class="writing-index">{String((page - 1) * 12 + index + 1).padStart(2, "0")}</span>
            <span class="writing-copy">
              <span class="writing-date"><time datetime={article.published_at ?? ""}>{dateLabel(article.published_at)}</time></span>
              <span class="writing-title serif">{article.title}</span>
              {#if article.excerpt}<span class="writing-excerpt">{article.excerpt}</span>{/if}
            </span>
            {#if article.cover_id}<img class="writing-thumb" src={imagePath(article.cover_id)} alt="" loading="lazy" />{/if}
            <ArrowUpRight class="writing-arrow" size={18} aria-hidden="true" />
          </a>
        </article>
      {/each}
    </div>
    <nav class="pager" aria-label="文章分页">
      <Button variant="ghost" href={"?page=" + (page - 1)} disabled={page === 1}>← 上一页</Button>
      <span class="meta">{page}</span>
      <Button variant="ghost" href={"?page=" + (page + 1)} disabled={!more}>下一页 →</Button>
    </nav>
  {:else}
    <div class="empty">
      <h2 class="serif text-3xl">还没有文章</h2>
      <Button href="/studio/new">写第一篇</Button>
    </div>
  {/if}
</section>
