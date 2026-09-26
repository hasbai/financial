<script lang="ts">
  import { dateLabel, site, writingPath } from "$lib/content";
  import { reveal } from "$lib/reveal";
  import { Asterisk, BookOpen, Clock3, NotebookPen } from "@lucide/svelte";
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
    <span class="hero-seal hero-rise" aria-hidden="true"><Asterisk size={55} strokeWidth={1.8} /></span>
    <h1 class="hero-exit-text"><span class="hero-greeting">Hi, 这里是 <em>北极手记</em><span class="hero-wave" aria-hidden="true"><Asterisk size={20} strokeWidth={2.2} /></span></span><span class="hero-statement">把 <em>想法</em> 写成文字，留下日常。</span></h1>
    <p class="hero-description hero-rise hero-exit-meta">写一点思考，记一些日常，让值得留下的文字慢慢生长。</p>
  </div>
  <div class="hero-whisper hero-rise hero-exit-meta">
    <p>「写下此刻，留给以后。」</p>
    <nav class="hero-links" aria-label="探索北极手记">
      <a href="/articles" aria-label="浏览文章"><BookOpen size={19} /></a>
      <a href="/notes" aria-label="浏览手记"><NotebookPen size={19} /></a>
      <a href="/timeline" aria-label="浏览时间线"><Clock3 size={19} /></a>
    </nav>
  </div>
</section>

<section class="wrap recent-section" id="recent">
  <div class="section-intro" use:reveal>
    <span class="eyebrow">RECENT WRITING</span>
    <div><h2 class="serif">近期笔墨</h2></div>
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
