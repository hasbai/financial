<script lang="ts">
  import { dateLabel, notePath, site, type Note } from "$lib/content";
  import { ArrowLeft } from "@lucide/svelte";
  let { note, html }: { note: Note; html: string } = $props();
</script>

<svelte:head>
  <title>手记 №{note.sequence} · {site.name}</title>
  <meta name="description" content={note.excerpt} />
  <link rel="canonical" href={site.origin + notePath(note)} />
</svelte:head>

<article class="reading note-reading entrance">
  <a class="back-link" href="/notes"><ArrowLeft size={16} /> 手记</a>
  <header class="reader-head note-reader-head">
    <span class="eyebrow">LETTER №{note.sequence}</span>
    <h1 class="serif">手记</h1>
    <time datetime={note.published_at ?? ""}>{dateLabel(note.published_at)}</time>
  </header>
  <div class="note-sheet"><div class="prose">{@html html}</div></div>
  <div class="reader-end"><a href="/notes">← 返回手记</a><a href={"/studio/notes/" + note.id}>编辑手记 ↗</a></div>
</article>
