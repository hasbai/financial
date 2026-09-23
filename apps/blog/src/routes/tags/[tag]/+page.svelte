<script lang="ts">
  import ArticleList from "$lib/components/ArticleList.svelte";
  import { site } from "$lib/content";
  let { data } = $props();
</script>

<svelte:head><title>#{data.tag.name} · {site.name}</title></svelte:head
><ArticleList {...data} title={"#" + data.tag.name} />
