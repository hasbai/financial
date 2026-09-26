<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { navigating, page } from "$app/state";
  import { Button } from "@hasbai/ui/button";
  import { Asterisk, Sun, Moon, PenLine } from "@lucide/svelte";
  import BackgroundEffect from "$lib/components/BackgroundEffect.svelte";
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
  <meta name="theme-color" content={dark ? "#1c1c1e" : "#fefefb"} />
</svelte:head>
<a class="skip" href="#main">跳转至正文</a>
<BackgroundEffect />
{#if page.url.pathname === "/about" || page.url.pathname.startsWith("/articles/") || /^\/notes\/\d+$/.test(page.url.pathname)}
  <div class="page-bleed" aria-hidden="true"><svg viewBox="0 0 1440 120" preserveAspectRatio="none"><path d="M-20 18 C260 19 330 12 570 18 S980 23 1460 15" /><path d="M-20 43 C220 40 350 49 610 40 S1030 33 1460 44" /><path d="M-20 68 C300 71 380 59 650 66 S1040 74 1460 65" /><path d="M-20 93 C270 89 410 101 720 92 S1110 87 1460 96" /></svg></div>
{/if}
<header class:scrolled class="site-header">
  <div class="header-inner wrap">
    <a class="wordmark" href="/" aria-label="北极手记首页"><span class="wordmark-symbol" aria-hidden="true"><Asterisk size={27} strokeWidth={2.3} /></span><span class="wordmark-label">{site.name}</span></a>
    <nav class="site-nav" aria-label="主导航">
      {#each nav as item}<a href={item.href} aria-current={current(item.href) ? "page" : undefined}>{item.label}</a>{/each}
    </nav>
    <div class="header-actions">
      <Button variant="ghost" size="icon" aria-label={dark ? "切换浅色" : "切换深色"} onclick={toggleTheme}>
        {#if dark}<Sun size={18} />{:else}<Moon size={18} />{/if}
      </Button>
      <Button variant="ghost" size="icon" href="/studio" class="write-link" aria-label="写作"><PenLine size={18} /></Button>
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
