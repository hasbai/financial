<script lang="ts">
  import ArticleReader from "$lib/components/ArticleReader.svelte";
  let { data } = $props();
</script>

<ArticleReader {...data} />
