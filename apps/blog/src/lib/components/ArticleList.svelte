<script lang="ts">
  import {
    articlePath,
    dateLabel,
    imagePath,
    readMinutes,
    type Article,
  } from "$lib/content";
  import { Button } from "@hasbai/ui/button";
  let {
    articles,
    title = "文字，慢慢写。",
    page = 1,
    more = false,
  }: {
    articles: Article[];
    title?: string;
    page?: number;
    more?: boolean;
  } = $props();
</script>

<section class="wrap">
  <div class="edition">
    <h1>{title}</h1>
    <span class="meta">ESSAYS & NOTES</span>
  </div>
  {#if articles.length}<div class="article-grid">
      {#each articles as article}<article class="article-card">
          {#if article.cover_id}<a
              href={articlePath(article)}
              class="cover-link"
              tabindex="-1"
              aria-hidden="true"
              ><img
                class="cover"
                src={imagePath(article.cover_id)}
                alt=""
                loading="lazy"
              /></a
            >{/if}
          <div>
            <div class="meta flex flex-wrap gap-3">
              <a href={"/" + article.category.slug}>{article.category.name}</a
              ><span>·</span><time datetime={article.published_at ?? ""}
                >{dateLabel(article.published_at)}</time
              >
            </div>
            <h2><a href={articlePath(article)}>{article.title}</a></h2>
            {#if article.excerpt}<p>{article.excerpt}</p>{/if}
            <div class="meta mt-6">
              {readMinutes(article.markdown)} 分钟阅读
            </div>
          </div>
        </article>{/each}
    </div>
    <nav class="mt-8 flex justify-between" aria-label="文章分页">
      <Button
        variant="outline"
        href={"?page=" + (page - 1)}
        disabled={page === 1}>上一页</Button
      ><Button variant="outline" href={"?page=" + (page + 1)} disabled={!more}
        >下一页</Button
      >
    </nav>{:else}<div class="empty">
      <h2 class="serif text-3xl">还没有文章</h2>
      <Button href="/studio/new">写第一篇</Button>
    </div>{/if}
</section>
