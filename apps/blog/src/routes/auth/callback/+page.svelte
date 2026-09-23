<script lang="ts">
  import { onMount } from "svelte";
  import { createAuth } from "$lib/auth.svelte";
  const auth = createAuth();
  onMount(() => {
    void auth.init();
  });
</script>

<svelte:head><meta name="robots" content="noindex,nofollow" /></svelte:head>
<section class="reading empty" role="status">
  {auth.error || "正在登录…"}
</section>
