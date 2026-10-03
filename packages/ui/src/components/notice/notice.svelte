<script lang="ts">
  import type { Snippet } from "svelte";
  import { CircleAlert, Info, CircleCheck } from "@lucide/svelte";
  let {
    variant = "info",
    children,
  }: { variant?: "info" | "error" | "warning" | "success"; children: Snippet } =
    $props();
</script>

<div
  role={variant === "error" ? "alert" : "status"}
  class="flex gap-3 rounded-lg border p-4 text-sm leading-6"
  class:text-destructive={variant === "error"}
  class:border-destructive={variant === "error"}
  class:bg-muted={variant !== "error"}
>
  {#if variant === "error" || variant === "warning"}<CircleAlert
      class="mt-0.5 size-5 shrink-0"
      aria-hidden="true"
    />{:else if variant === "success"}<CircleCheck
      class="mt-0.5 size-5 shrink-0"
      aria-hidden="true"
    />{:else}<Info class="mt-0.5 size-5 shrink-0" aria-hidden="true" />{/if}
  <div class="min-w-0 flex-1">{@render children()}</div>
</div>
