<script lang="ts">
  import { Notice } from "@hasbai/ui/notice";
  import type { Snippet } from "svelte";
  let { variant = "info", children }: { variant?: "info" | "error" | "warning" | "success"; children: Snippet } = $props();
</script>

<Notice {variant}>{@render children()}</Notice>
