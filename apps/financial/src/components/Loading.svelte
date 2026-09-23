<script lang="ts">
  import { LoaderCircle } from "@lucide/svelte";
</script>

<div
  role="status"
  class="flex min-h-40 items-center justify-center gap-2 text-muted-foreground"
>
  <LoaderCircle
    class="size-5 animate-spin motion-reduce:animate-none"
    aria-hidden="true"
  />正在加载…
</div>
