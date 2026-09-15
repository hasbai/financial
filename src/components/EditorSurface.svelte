<script lang="ts">
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import * as Dialog from "$lib/components/ui/dialog";

  let {
    title,
    close,
    children,
  }: { title: string; close: () => void; children: Snippet } = $props();
  const desktop = new MediaQuery("(min-width: 640px)");
  function focusPage(node: HTMLElement) {
    node.focus({ preventScroll: true });
  }
</script>

{#if desktop.current}
  <Dialog.Root
    open={true}
    onOpenChange={(open) => {
      if (!open) close();
    }}
  >
    <Dialog.Content
      showCloseButton={false}
      class="editor-surface flex flex-col gap-0 p-0 sm:max-w-2xl"
      onEscapeKeydown={(event) => {
        event.preventDefault();
        close();
      }}
      onInteractOutside={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <Dialog.Title class="sr-only">{title}</Dialog.Title>
      <Dialog.Description class="sr-only">交易</Dialog.Description>
      {@render children()}
    </Dialog.Content>
  </Dialog.Root>
{:else}
  <section
    class="editor-page editor-surface"
    aria-label={title}
    tabindex="-1"
    use:focusPage
  >
    {@render children()}
  </section>
{/if}
