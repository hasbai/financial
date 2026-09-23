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
</script>

<svelte:head><title>时间线 · {site.name}</title><link rel="canonical" href={site.origin + "/timeline"} /></svelte:head>
<section class="wrap collection timeline-page">
  <div class="collection-heading entrance">
    <span class="eyebrow">ARCHIVE / TIMELINE</span>
    <h1 class="serif">时间线</h1>
    <p>沿着时间，回看写下的文章与手记。</p>
  </div>
  {#if groups.length}
    <div class="timeline-groups">
      {#each groups as [year, writings]}
        <section class="timeline-year" aria-label={year + " 年"}>
          <h2 class="serif">{year}</h2>
          <div class="timeline-items">
            {#each writings as writing, index (writing.id)}
              <a href={writingPath(writing)} class="timeline-item" use:reveal={index}>
                <time datetime={writing.published_at ?? ""}>{dateLabel(writing.published_at)}</time>
                <span class="timeline-kind">{writing.kind === "article" ? "文章" : "手记"}</span>
                <span class="timeline-title serif">{writing.kind === "article" ? writing.title : writing.excerpt || `手记 №${writing.sequence}`}</span>
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
