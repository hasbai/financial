<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { navigating, page } from "$app/state";
  import { Button } from "@hasbai/ui/button";
  import { Sun, Moon, ArrowUpRight } from "@lucide/svelte";
  import { site } from "$lib/content";
  let { children } = $props();
  let dark = $state(false);
  let scrolled = $state(false);
  const nav = [
    { href: "/", label: "首页" },
    { href: "/articles", label: "文章" },
    { href: "/notes", label: "手记" },
    { href: "/timeline", label: "时间线" },
    { href: "/about", label: "关于" },
  ];
  function current(href: string) {
    return href === "/" ? page.url.pathname === "/" : page.url.pathname === href || page.url.pathname.startsWith(href + "/");
  }
  function applyTheme(value: boolean) {
    dark = value;
    document.documentElement.classList.toggle("dark", value);
  }
  onMount(() => {
    const saved = localStorage.getItem("hasbai.theme");
    applyTheme(saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches);
    const updateScroll = () => { scrolled = scrollY > 28; };
    updateScroll();
    addEventListener("scroll", updateScroll, { passive: true });
    return () => removeEventListener("scroll", updateScroll);
  });
  function toggleTheme() {
    applyTheme(!dark);
    localStorage.setItem("hasbai.theme", dark ? "dark" : "light");
  }
</script>

<svelte:head>
  <title>{site.name}</title>
  <meta name="theme-color" content={dark ? "#1d1b19" : "#faf8f4"} />
</svelte:head>
<a class="skip" href="#main">跳转至正文</a>
<header class:scrolled class="site-header">
  <div class="header-inner wrap">
    <a class="wordmark" href="/" aria-label="北极手记首页"><span class="wordmark-symbol" aria-hidden="true">✳</span><span>{site.name}</span></a>
    <nav class="site-nav" aria-label="主导航">
      {#each nav as item}<a href={item.href} aria-current={current(item.href) ? "page" : undefined}>{item.label}</a>{/each}
    </nav>
    <div class="header-actions">
      <Button variant="ghost" size="icon" aria-label={dark ? "切换浅色" : "切换深色"} onclick={toggleTheme}>
        {#if dark}<Sun size={18} />{:else}<Moon size={18} />{/if}
      </Button>
      <Button variant="ghost" href="/studio" class="write-link">写作 <ArrowUpRight size={15} /></Button>
    </div>
  </div>
</header>
<main id="main">
  {#if navigating.to && navigating.to.url.href !== page.url.href}
    <section class="wrap navigation-skeleton" aria-label="正在打开页面" aria-busy="true">
      <div class="skeleton-line skeleton-kicker"></div>
      <div class="skeleton-line skeleton-title"></div>
      <div class="skeleton-line skeleton-subtitle"></div>
      <div class="skeleton-block"></div>
      <div class="skeleton-block"></div>
    </section>
  {:else}
    {@render children()}
  {/if}
</main>
<footer class="wrap footer">
  <div><a class="footer-name serif" href="/">{site.name}</a><p>写下此刻，留给以后。</p></div>
  <nav aria-label="页脚导航"><a href="/articles">文章</a><a href="/notes">手记</a><a href="/timeline">时间线</a><a href="/about">关于</a><a href="https://financial.hasbai.xyz">个人财务 ↗</a></nav>
  <span class="footer-mark">© {new Date().getFullYear()} HASBAI</span>
</footer>
