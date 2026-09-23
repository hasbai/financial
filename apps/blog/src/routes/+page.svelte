<script lang="ts">
  import ArticleList from "$lib/components/ArticleList.svelte";
  import { site } from "$lib/content";
  let { data } = $props();
</script>

<svelte:head
  ><title>{site.name} — 文字，慢慢写。</title><meta
    name="description"
    content="北极手记，记录思考与日常。"
  /><link rel="canonical" href={site.origin} /></svelte:head
><ArticleList {...data} />
