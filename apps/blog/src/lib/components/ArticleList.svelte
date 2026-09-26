<script lang="ts">
  import { articlePath, dateLabel, type Article, type Tag } from "$lib/content";
  import { reveal } from "$lib/reveal";
  import { Button } from "@hasbai/ui/button";
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
    <span class="eyebrow">BLOG</span>
    <h1>{title}</h1>
  </div>
  <div class="collection-grid">
    <div class="collection-main">
      {#if articles.length}
        <div class="writing-list">
          {#each articles as article, index (article.id)}
            <article class:featured={index === 0 && page === 1} class="writing-row" use:reveal={index}>
              <a class="writing-row-main" href={articlePath(article)}>
                <span class="writing-copy">
                  <span class="writing-title">{article.title}</span>
                  {#if article.excerpt}<span class="writing-excerpt">{article.excerpt}</span>{/if}
                  <span class="writing-date"><time datetime={article.published_at ?? ""}>{dateLabel(article.published_at)}</time> · 文章</span>
                </span>
              </a>
            </article>
          {/each}
        </div>
        {#if page > 1 || more}
          <nav class="pager" aria-label="文章分页">
            <Button variant="ghost" href={"?page=" + (page - 1)} disabled={page === 1}>← 上一页</Button>
            <span class="meta">{page}</span>
            <Button variant="ghost" href={"?page=" + (page + 1)} disabled={!more}>下一页 →</Button>
          </nav>
        {/if}
      {:else}
        <div class="empty">
          <h2 class="text-3xl">还没有文章</h2>
          <Button href="/studio/new">写第一篇</Button>
        </div>
      {/if}
    </div>
    <aside class="collection-side" aria-label="内容导航">
      <span class="eyebrow">EXPLORE</span>
      <nav aria-label="浏览内容"><a href="/articles" aria-current={!tag ? "page" : undefined}>全部文章</a><a href="/notes">手记</a><a href="/timeline">时间线</a></nav>
      {#if tags.length}<div class="tag-filter" aria-label="按标签筛选文章">
        {#each tags as item}<a href={"/tags/" + item.slug} aria-current={tag?.id === item.id ? "page" : undefined}>{item.name}</a>{/each}
      </div>{/if}
    </aside>
  </div>
</section>
