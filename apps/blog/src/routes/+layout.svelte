<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { Button } from "@hasbai/ui/button";
  import { Sun, Moon, ArrowUpRight } from "@lucide/svelte";
  import { site } from "$lib/content";
  let { data, children } = $props();
  let dark = $state(false);
  function applyTheme(value: boolean) {
    dark = value;
    document.documentElement.classList.toggle("dark", value);
  }
  onMount(() => {
    const saved = localStorage.getItem("hasbai.theme");
    applyTheme(
      saved
        ? saved === "dark"
        : matchMedia("(prefers-color-scheme: dark)").matches,
    );
  });
  function toggleTheme() {
    applyTheme(!dark);
    localStorage.setItem("hasbai.theme", dark ? "dark" : "light");
  }
</script>

<svelte:head
  ><title>{site.name}</title><meta
    name="theme-color"
    content={dark ? "#171717" : "#fafafa"}
  /></svelte:head
>
<a class="skip" href="#main">跳转至正文</a>
<header class="masthead wrap">
  <div class="topline">
    <a class="wordmark" href="/"
      >{site.name}<span
        class="ml-3 text-sm font-normal tracking-normal text-muted-foreground"
        >HASBAI</span
      ></a
    >
    <div class="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label={dark ? "切换浅色" : "切换深色"}
        onclick={toggleTheme}
        >{#if dark}<Sun size={18} />{:else}<Moon size={18} />{/if}</Button
      ><Button variant="ghost" href="/studio"
        >写作 <ArrowUpRight size={15} /></Button
      >
    </div>
  </div>
  <nav class="site-nav" aria-label="主导航">
    <a href="/" aria-current={page.url.pathname === "/" ? "page" : undefined}
      >全部文章</a
    >{#each data.categories as category}<a
        href={"/" + category.slug}
        aria-current={page.params.category === category.slug
          ? "page"
          : undefined}>{category.name}</a
      >{/each}
  </nav>
</header>
<main id="main">{@render children()}</main>
<footer class="wrap footer">
  <span>{site.name} · HASBAI</span>
  <div class="flex gap-6">
    <a href="https://financial.hasbai.xyz">个人财务 ↗</a><a href="/studio"
      >编辑室</a
    ><a href="#main">回到顶部 ↑</a>
  </div>
</footer>
