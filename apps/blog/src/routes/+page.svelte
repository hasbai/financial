<script lang="ts">
  import { dateLabel, site, writingPath } from "$lib/content";
  import { reveal } from "$lib/reveal";
  let { data } = $props();
</script>

<svelte:head>
  <title>{site.name} — 写下此刻，留给以后。</title>
  <meta name="description" content="北极手记，记录思考与日常。" />
  <link rel="canonical" href={site.origin} />
</svelte:head>

<section class="home-hero hero-scroll-container wrap">
  <div class="hero-glow hero-exit-bg" aria-hidden="true"></div>
  <div class="hero-center">
    <span class="hero-seal hero-rise" aria-hidden="true">✳</span>
    <h1 class="serif hero-exit-text">你好，欢迎来到<br /><em>北极手记。</em></h1>
    <p class="hero-description hero-rise hero-exit-meta">写一点思考，记一些日常。让值得留下的文字，在这里慢慢生长。</p>
  </div>
  <div class="hero-bottom hero-rise hero-exit-meta">
    <span>WORDS, IN THEIR OWN TIME</span>
    <a href="#recent">往下读 <span aria-hidden="true">↓</span></a>
    <span>HASBAI / BLOG</span>
  </div>
</section>

<section class="wrap recent-section" id="recent">
  <div class="section-intro" use:reveal>
    <span class="eyebrow">RECENT WRITING</span>
    <div><h2 class="serif">最近写下的</h2><p>文章与手记，按时间相遇。</p></div>
  </div>
  {#if data.recent.length}
    <div class="recent-list">
      {#each data.recent as writing, index (writing.id)}
        <a class="recent-item" href={writingPath(writing)} use:reveal={index}>
          <span class="recent-index">{String(index + 1).padStart(2, "0")}</span>
          <span class="recent-body"><span class="recent-title serif">{writing.kind === "article" ? writing.title : writing.excerpt || `手记 №${writing.sequence}`}</span><span class="recent-meta">{writing.kind === "article" ? "文章" : "手记"} · <time datetime={writing.published_at ?? ""}>{dateLabel(writing.published_at)}</time></span></span>
          <span class="recent-arrow" aria-hidden="true">↗</span>
        </a>
      {/each}
    </div>
  {:else}
    <div class="empty"><h3 class="serif text-3xl">还没有文字</h3><a href="/studio/new">写下第一篇 →</a></div>
  {/if}
</section>

<section class="wrap home-explore" aria-label="探索内容">
  <a href="/articles" use:reveal><span class="eyebrow">01 / ARTICLE</span><h2 class="serif">文章</h2><p>完整的观察与思考。</p><span class="explore-arrow" aria-hidden="true">↗</span></a>
  <a href="/notes" use:reveal={1}><span class="eyebrow">02 / NOTE</span><h2 class="serif">手记</h2><p>不必有标题的日常。</p><span class="explore-arrow" aria-hidden="true">↗</span></a>
</section>
