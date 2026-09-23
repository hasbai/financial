<script lang="ts">
  import { dateLabel, notePath, yearLabel, type Note } from "$lib/content";
  import { reveal } from "$lib/reveal";
  import { Button } from "@hasbai/ui/button";
  let { notes, page = 1, more = false }: { notes: Note[]; page?: number; more?: boolean } = $props();
  const groups = $derived.by(() => {
    const years = new Map<string, Note[]>();
    for (const note of notes) {
      const year = yearLabel(note.published_at);
      years.set(year, [...(years.get(year) ?? []), note]);
    }
    return [...years];
  });
</script>

<section class="wrap collection note-collection">
  <div class="collection-heading entrance">
    <span class="eyebrow">WRITING / NOTES</span>
    <h1 class="serif">手记</h1>
    <p>一些还不需要标题的片刻。</p>
  </div>
  {#if notes.length}
    {#each groups as [year, group]}
      <section class="note-year" aria-label={year + " 年手记"}>
        <div class="note-year-heading"><span class="eyebrow">ANNO</span><h2>{year}</h2><span class="meta">{group.length} 则</span></div>
        <div class="note-track">
          {#each group as note, index (note.id)}
            <article class="note-entry" use:reveal={index}>
              <time datetime={note.published_at ?? ""}>{dateLabel(note.published_at)}</time>
              <a class="note-paper" href={notePath(note)}>
                <span class="eyebrow">LETTER №{note.sequence}</span>
                <p class="serif">{note.excerpt || "一则手记"}</p>
                <span class="note-read">阅读全文 →</span>
              </a>
            </article>
          {/each}
        </div>
      </section>
    {/each}
    <nav class="pager" aria-label="手记分页">
      <Button variant="ghost" href={"?page=" + (page - 1)} disabled={page === 1}>← 上一页</Button>
      <span class="meta">{page}</span>
      <Button variant="ghost" href={"?page=" + (page + 1)} disabled={!more}>下一页 →</Button>
    </nav>
  {:else}
    <div class="empty"><h2 class="serif text-3xl">还没有手记</h2><Button href="/studio/notes/new">写第一则</Button></div>
  {/if}
</section>
