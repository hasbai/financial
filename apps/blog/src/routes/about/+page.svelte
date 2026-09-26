<script lang="ts">
  import { site } from "$lib/content";
</script>

<svelte:head><title>关于 · {site.name}</title><meta name="description" content="关于北极手记。" /><link rel="canonical" href={site.origin + "/about"} /></svelte:head>
<section class="wrap about-page entrance">
  <div class="about-main">
    <header class="about-heading"><span class="eyebrow">ABOUT / HASBAI</span><h1>关于北极手记</h1><p>这里是一个放慢节奏、认真记录的地方。</p></header>
    <div class="about-copy">
      <p>很高兴能在这里与你相遇。</p>
      <blockquote>写下此刻，留给以后。</blockquote>
      <h2 id="writing">文字</h2>
      <p>文章用来整理相对完整的思考；手记留下日常里值得回看的片刻。它们按时间生长，也可以从标签和时间线重新找到。</p>
      <h2 id="encounter">相遇</h2>
      <p>谢谢你来到这里。愿这些文字在某个时刻，与你有一次安静的相遇。</p>
    </div>
    <nav class="about-links" aria-label="继续浏览"><a href="/articles">读文章 ↗</a><a href="/notes">看手记 ↗</a><a href="/timeline">沿时间线 ↗</a></nav>
  </div>
  <nav class="about-index" aria-label="页内导航"><a href="#writing">文字</a><a href="#encounter">相遇</a><a href="/articles">文章</a><a href="/notes">手记</a></nav>
</section>
