<script lang="ts">
  import type { Snippet } from "svelte";
  import { NotebookPen } from "@lucide/svelte";
  let { title, children }: { title: string; children?: Snippet } = $props();
</script>

<div class="space-y-4 rounded-xl border border-dashed px-6 py-12 text-center">
  <NotebookPen
    class="mx-auto size-8 text-muted-foreground"
    aria-hidden="true"
  />
  <h2 class="text-lg font-semibold">{title}</h2>
  {@render children?.()}
</div>
