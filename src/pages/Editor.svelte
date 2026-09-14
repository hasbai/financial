<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import * as Dialog from "$lib/components/ui/dialog";
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
  <Dialog.Root
    open={true}
    onOpenChange={(v) => {
      if (!v) close();
    }}
    ><Dialog.Content showCloseButton={false}
      ><Dialog.Header
        ><Dialog.Title>交易详情</Dialog.Title><Dialog.Description
          class="sr-only">交易</Dialog.Description
        ></Dialog.Header
      >
      {#if !validId}<Notice variant="error">无效的交易编号。</Notice
        >{:else if query.isPending}<Loading />{:else if query.error}<Failure
          error={query.error}
          retry={() => query.refetch()}
        />{:else}<Notice variant="error">记录不存在或没有访问权限。</Notice
        >{/if}
      <Dialog.Footer
        ><Button variant="outline" onclick={close}>关闭</Button></Dialog.Footer
      >
    </Dialog.Content></Dialog.Root
  >
{/if}
