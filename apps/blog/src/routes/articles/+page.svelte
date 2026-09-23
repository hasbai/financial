<script lang="ts">
  import ArticleList from "$lib/components/ArticleList.svelte";
  import { site } from "$lib/content";
  let { data } = $props();
</script>

<svelte:head><title>文章 · {site.name}</title><link rel="canonical" href={site.origin + "/articles"} /></svelte:head>
<ArticleList {...data} />
