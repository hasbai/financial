<script lang="ts">
  import NoteList from "$lib/components/NoteList.svelte";
  import { site } from "$lib/content";
  let { data } = $props();
</script>

<svelte:head><title>手记 · {site.name}</title><link rel="canonical" href={site.origin + "/notes"} /></svelte:head>
<NoteList {...data} />
