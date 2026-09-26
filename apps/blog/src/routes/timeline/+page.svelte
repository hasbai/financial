<script lang="ts">
  import { dateLabel, site, writingPath, yearLabel, type Writing } from "$lib/content";
  import { reveal } from "$lib/reveal";
  let { data } = $props();
  const groups = $derived.by(() => {
    const years = new Map<string, Writing[]>();
    for (const writing of data.writings) {
      const year = yearLabel(writing.published_at);
      years.set(year, [...(years.get(year) ?? []), writing]);
    }
    return [...years];
  });
  const articleCount = $derived(data.writings.filter((writing: Writing) => writing.kind === "article").length);
  const noteCount = $derived(data.writings.length - articleCount);
  function monthLabel(value: string | null) {
    return value ? new Date(value).toLocaleDateString("zh-CN", { month: "long", timeZone: "Asia/Shanghai" }) : "未定日期";
  }
  function dayLabel(value: string | null) {
    return value ? new Date(value).toLocaleDateString("zh-CN", { day: "2-digit", timeZone: "Asia/Shanghai" }) : "—";
  }
</script>

<svelte:head><title>时间线 · {site.name}</title><link rel="canonical" href={site.origin + "/timeline"} /></svelte:head>
<section class="wrap collection timeline-page">
  <div class="timeline-summary entrance">
    <h1>时间线</h1>
    <p><strong>{data.writings.length}</strong><span>则记录，再按年翻阅</span></p>
    <div class="timeline-stats" aria-label="内容统计"><span><strong>{articleCount}</strong><small>文章</small></span><span><strong>{noteCount}</strong><small>手记</small></span><span><strong>{groups.length}</strong><small>年份</small></span></div>
    <span class="timeline-hint">写下此刻，留给以后。</span>
  </div>
  {#if groups.length}
    <div class="timeline-groups">
      {#each groups as [year, writings]}
        <section class="timeline-year" aria-label={year + " 年"}>
          <h2>{year}<span>本年 {writings.length} 则</span></h2>
          <div class="timeline-items">
            {#each writings as writing, index (writing.id)}
              {#if index === 0 || monthLabel(writing.published_at) !== monthLabel(writings[index - 1].published_at)}
                <p class="timeline-month">{monthLabel(writing.published_at)}</p>
              {/if}
              <a href={writingPath(writing)} class="timeline-item" use:reveal={index}>
                <time datetime={writing.published_at ?? ""} aria-label={dateLabel(writing.published_at)}>{dayLabel(writing.published_at)}</time>
                <span class="timeline-title">{writing.kind === "article" ? writing.title : writing.excerpt || `手记 №${writing.sequence}`}</span>
                <span class="timeline-kind">{writing.kind === "article" ? "文章" : "手记"}</span>
                <span class="timeline-arrow" aria-hidden="true">↗</span>
              </a>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {:else}
    <div class="empty"><h2 class="serif text-3xl">时间线尚无内容</h2><a href="/articles">浏览文章 →</a></div>
  {/if}
</section>
