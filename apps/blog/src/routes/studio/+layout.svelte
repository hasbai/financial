<script lang="ts">
  import AuthGate from "$lib/components/AuthGate.svelte";
  let { children } = $props();
</script>

<svelte:head><meta name="robots" content="noindex,nofollow" /></svelte:head
><AuthGate>{@render children()}</AuthGate>
