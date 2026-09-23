<script lang="ts">
  import NoteReader from "$lib/components/NoteReader.svelte";
  let { data } = $props();
</script>

<NoteReader {...data} />
