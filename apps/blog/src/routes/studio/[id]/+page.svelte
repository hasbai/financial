<script lang="ts">
  import { page } from "$app/state";
  import ArticleEditor from "$lib/components/ArticleEditor.svelte";
</script>

{#key page.params.id}<ArticleEditor id={page.params.id} />{/key}
