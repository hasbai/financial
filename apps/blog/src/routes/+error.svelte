<script lang="ts">
  import { page } from "$app/state";
  import { Button } from "@hasbai/ui/button";
</script>

<section class="reading empty">
  <span class="meta">{page.status}</span>
  <h1 class="serif text-3xl">{page.error?.message ?? "页面暂时无法打开"}</h1>
  <div class="flex justify-center gap-3">
    <Button variant="outline" onclick={() => location.reload()}>重试</Button
    ><Button href="/">返回首页</Button>
  </div>
</section>
