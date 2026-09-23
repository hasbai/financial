<script lang="ts">
  import { onMount } from "svelte";
  import { QueryClient, QueryClientProvider } from "@tanstack/svelte-query";
  import { createAuth } from "./lib/auth.svelte";
  import { createRepository } from "./lib/api";
  import { setRepository } from "./lib/context";
  import { router } from "./lib/router.svelte";
  import Shell from "./Shell.svelte";
  const cache = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30000, retry: 1, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  const auth = createAuth();
  setRepository(createRepository(auth.getToken, cache));
  onMount(() => {
    const stop = router.start();
    void auth.init(() => cache.clear());
    return stop;
  });
</script>

<svelte:window onclick={router.intercept} />
<QueryClientProvider client={cache}
  ><Shell {auth} clearCache={() => cache.clear()} /></QueryClientProvider
>
