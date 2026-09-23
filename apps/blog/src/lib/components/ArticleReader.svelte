<script lang="ts">
  import {
    articlePath,
    dateLabel,
    imagePath,
    readMinutes,
    site,
    type Article,
    type Tag,
  } from "$lib/content";
  let { article, html, tags }: { article: Article; html: string; tags: Tag[] } =
    $props();
</script>

<svelte:head
  ><title>{article.title} · {site.name}</title><meta
    name="description"
    content={article.excerpt}
  /><link rel="canonical" href={site.origin + articlePath(article)} /><meta
    property="og:type"
    content="article"
  /><meta property="og:title" content={article.title} /><meta
    property="og:description"
    content={article.excerpt}
  /><meta
    property="og:url"
    content={site.origin + articlePath(article)}
  />{#if article.cover_id}<meta
      property="og:image"
      content={site.origin + imagePath(article.cover_id)}
    />{/if}</svelte:head
>
<article class="reading">
  <a class="meta" href={"/" + article.category.slug}
    >{article.category.name} ↗</a
  >
  <h1 class="article-title">{article.title}</h1>
  {#if article.excerpt}<p class="article-deck">{article.excerpt}</p>{/if}
  <div class="meta mt-8 flex flex-wrap gap-4 border-b pb-8">
    <time datetime={article.published_at ?? ""}
      >{dateLabel(article.published_at)}</time
    ><span>{readMinutes(article.markdown)} 分钟阅读</span>
  </div>
  {#if article.cover_id}<img
      class="cover mt-10"
      src={imagePath(article.cover_id)}
      alt={article.title}
    />{/if}
  <div class="prose py-4">{@html html}</div>
  <div class="mt-10 flex flex-wrap gap-3 border-t pt-6">
    {#each tags as tag}<a
        class="rounded-full border px-4 py-2 text-sm"
        href={"/tags/" + tag.slug}>#{tag.name}</a
      >{/each}
  </div>
  <div class="mt-10 flex justify-between text-sm">
    <a href="/">← 全部文章</a><a href={"/studio/" + article.id}>编辑文章 ↗</a>
  </div>
</article>
