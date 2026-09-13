<script lang="ts">
  import { errorMessage } from "$lib/api";
  import { Button } from "$lib/components/ui/button";
  import Notice from "./Notice.svelte";
  let { error, retry }: { error: unknown; retry: () => unknown } = $props();
</script>

<Notice variant="error"
  >{errorMessage(error)}<Button variant="outline" class="ml-3" onclick={retry}
    >重试</Button
  ></Notice
>
