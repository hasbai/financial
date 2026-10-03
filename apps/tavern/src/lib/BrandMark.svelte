<script lang="ts">
  let { size = 24, strokeWidth = 1.8 }: { size?: number; strokeWidth?: number } = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#each [0, 60, 120, 180, 240, 300] as rotation}
    <g transform={`rotate(${rotation} 12 12)`}>
      <path d="M12 12V2.5" />
      <path d="M9.5 5.5 12 8l2.5-2.5" />
    </g>
  {/each}
</svg>
