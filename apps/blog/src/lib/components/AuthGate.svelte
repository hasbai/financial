<script lang="ts">
  import { onMount, setContext, type Snippet } from "svelte";
  import { createAuth } from "$lib/auth.svelte";
  import { Button } from "@hasbai/ui/button";
  let { children }: { children: Snippet } = $props();
  const auth = createAuth();
  setContext("blog-auth", auth);
  onMount(() => {
    void auth.init();
  });
</script>

{#if auth.loading}<section class="reading empty" role="status">
    正在打开编辑室…
  </section>{:else if auth.user}{@render children()}{:else}<section
    class="reading empty"
  >
    <span class="meta">THE WRITING ROOM</span>
    <h1 class="serif text-4xl">编辑室</h1>
    {#if auth.error}<p class="error" role="alert">{auth.error}</p>{/if}<Button
      onclick={() => auth.login()}>登录</Button
    >
  </section>{/if}
