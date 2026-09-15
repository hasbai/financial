<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import { ArrowLeft } from "@lucide/svelte";
  import EditorSurface from "../components/EditorSurface.svelte";
  import { Button } from "$lib/components/ui/button";
  import { useApi } from "$lib/context";
  import { router } from "$lib/router.svelte";
  import Loading from "../components/Loading.svelte";
  import Failure from "../components/Failure.svelte";
  import Notice from "../components/Notice.svelte";
  import EditorForm from "./EditorForm.svelte";
  let { hidden }: { hidden: boolean } = $props();
  const segment = router.location.pathname.split("/")[2];
  const id = segment === "new" ? null : Number(segment);
  const validId = id !== null && Number.isSafeInteger(id) && id > 0;
  const api = useApi();
  const query = createQuery(() => ({
    queryKey: ["transaction", id],
    queryFn: () => api.transaction(id!),
    enabled: validId,
  }));
  const close = () => router.navigate("/transactions" + router.location.search);
</script>

{#if id === null || (validId && query.data)}
  <EditorForm original={query.data ?? null} {hidden} />
{:else}
  <EditorSurface title="交易详情" {close}>
    <header
      class="mobile-panel-header flex shrink-0 items-center gap-3 bg-card px-5 py-4"
    >
      <Button variant="ghost" size="icon" aria-label="返回流水" onclick={close}
        ><ArrowLeft aria-hidden="true" /></Button
      >
      <h1 class="text-xl">交易详情</h1>
    </header>
    <div class="editor-scroll min-h-0 flex-1 overflow-y-auto p-5">
      {#if !validId}<Notice variant="error">无效的交易编号。</Notice
        >{:else if query.isPending}<Loading />{:else if query.error}<Failure
          error={query.error}
          retry={() => query.refetch()}
        />{:else}<Notice variant="error">记录不存在或没有访问权限。</Notice
        >{/if}
    </div>
  </EditorSurface>
{/if}
