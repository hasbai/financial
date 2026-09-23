<script lang="ts">
  import { ChevronRight, ListTree } from "@lucide/svelte";
</script>

<div class="page">
  <div class="page-heading pr-12"><h1>设置</h1></div>
  <a
    href="/accounts"
    class="finance-card flex min-h-16 items-center gap-3 p-5 transition-colors hover:bg-accent"
  >
    <ListTree class="size-5 text-muted-foreground" aria-hidden="true" />
    <span class="flex-1 font-medium">科目</span>
    <ChevronRight class="size-5 text-muted-foreground" aria-hidden="true" />
  </a>
</div>
