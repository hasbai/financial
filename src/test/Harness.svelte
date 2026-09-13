<script lang="ts">
  import { onMount, untrack } from "svelte";
  import {
    QueryClientProvider,
    type QueryClient,
  } from "@tanstack/svelte-query";
  import type { Repository } from "$lib/api";
  import { setRepository } from "$lib/context";
  import { router } from "$lib/router.svelte";
  import Editor from "../pages/Editor.svelte";
  import Transactions from "../pages/Transactions.svelte";
  import Overview from "../pages/Overview.svelte";
  import Accounts from "../pages/Accounts.svelte";
  let {
    api,
    cache,
    page = "editor",
    hidden = false,
  }: {
    api: Repository;
    cache: QueryClient;
    page?: "editor" | "transactions" | "overview" | "accounts";
    hidden?: boolean;
  } = $props();
  setRepository(untrack(() => api));
  onMount(() => router.start());
</script>

<svelte:window onclick={router.intercept} />
<QueryClientProvider client={cache}>
  {#if page === "editor"}<Editor
      {hidden}
    />{:else if page === "transactions"}<Transactions
      {hidden}
    />{:else if page === "accounts"}<Accounts />{:else}<Overview
      {hidden}
    />{/if}
</QueryClientProvider>
