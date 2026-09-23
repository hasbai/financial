<script lang="ts">
  import { page } from "$app/state";
  import NoteEditor from "$lib/components/NoteEditor.svelte";
</script>

{#key page.params.id}<NoteEditor id={page.params.id} />{/key}
