<script lang="ts">
  import { onMount } from "svelte";
  import {
    Wallet,
    LayoutDashboard,
    ReceiptText,
    Settings,
    Plus,
    Eye,
    EyeOff,
    Moon,
    Sun,
    LogOut,
  } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import Notice from "./components/Notice.svelte";
  import Loading from "./components/Loading.svelte";
  import Empty from "./components/Empty.svelte";
  import { config } from "./lib/config";
  import { router } from "./lib/router.svelte";
  import type { createAuth } from "./lib/auth.svelte";
  let {
    auth,
    clearCache,
  }: { auth: ReturnType<typeof createAuth>; clearCache: () => void } = $props();
  let dark = $state(false);
  let hidden = $state(localStorage.getItem("financial.hideAmounts") === "true");
  let themeChosen = false;
  onMount(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    dark = media.matches;
    const changed = () => {
      if (!themeChosen) dark = media.matches;
    };
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  });
  $effect(() => {
    document.documentElement.classList.toggle("dark", dark);
  });
  const nav = [
    { path: "/", label: "财务总览", icon: LayoutDashboard },
    { path: "/transactions", label: "交易流水", icon: ReceiptText },
    { path: "/accounts", label: "科目设置", icon: Settings },
  ];
  let path = $derived(router.location.pathname);
  let authorized = $derived(auth.user?.sub === config.ownerSubject);
  function toggleAmounts() {
    hidden = !hidden;
    localStorage.setItem("financial.hideAmounts", String(hidden));
  }
</script>

{#if !auth.user}
  <main class="grid min-h-dvh place-items-center px-5 py-10">
    <Card.Root class="w-full max-w-md">
      <Card.Content class="space-y-6 p-8 sm:p-10">
        <div
          class="grid size-14 place-items-center rounded-xl bg-primary text-primary-foreground"
        >
          <Wallet class="size-7" aria-hidden="true" />
        </div>
        <p class="font-semibold text-primary">北极账本</p>
        <h1 class="text-3xl font-semibold tracking-tight">
          每一笔，都心中有数。
        </h1>
        <p class="leading-7 text-muted-foreground">
          看清资产与负债，梳理现金收支。把零散的流水，整理成清晰的生活记录。
        </p>
        {#if auth.error}<Notice variant="error">{auth.error}</Notice>{/if}
        <Button
          class="w-full"
          disabled={auth.loading}
          onclick={() => auth.login()}
          >{auth.loading ? "正在验证登录…" : "使用北极小站登录"}</Button
        >
        <p class="text-sm text-muted-foreground">
          仅本人账号可访问。使用 Auth0 安全登录。
        </p>
      </Card.Content>
    </Card.Root>
  </main>
{:else}
  <a href="#main" class="skip-link">跳到主要内容</a>
  <aside
    class="fixed inset-y-0 left-0 hidden w-56 flex-col gap-2 border-r bg-sidebar p-5 text-sidebar-foreground md:flex"
  >
    <a
      href="/"
      class="mb-8 flex min-h-12 items-center gap-3 px-3 text-lg font-semibold"
      ><Wallet class="size-6 text-primary" aria-hidden="true" />北极账本</a
    >
    <nav aria-label="主要导航" class="space-y-2">
      {#each nav as item}
        <Button
          href={item.path}
          variant={(
            item.path === "/" ? path === "/" : path.startsWith(item.path)
          )
            ? "default"
            : "ghost"}
          class="w-full justify-start"
          aria-current={path === item.path ? "page" : undefined}
          ><item.icon aria-hidden="true" />{item.label}</Button
        >
      {/each}
    </nav>
    <p class="mt-auto px-3 text-xs text-muted-foreground">
      让每一笔收支都有去处。
    </p>
  </aside>
  <div class="md:ml-56">
    <header class="flex h-20 items-center justify-between gap-2 px-4 sm:px-8">
      <span class="flex items-center gap-2 font-semibold"
        ><span
          class="grid size-8 place-items-center rounded-lg bg-primary text-sm text-primary-foreground"
          >账</span
        >个人财务</span
      >
      <div class="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label={hidden ? "显示金额" : "隐藏金额"}
          onclick={toggleAmounts}
          >{#if hidden}<EyeOff aria-hidden="true" />{:else}<Eye
              aria-hidden="true"
            />{/if}</Button
        >
        <Button
          variant="ghost"
          size="icon"
          aria-label="切换深浅主题"
          onclick={() => {
            themeChosen = true;
            dark = !dark;
          }}
          >{#if dark}<Sun aria-hidden="true" />{:else}<Moon
              aria-hidden="true"
            />{/if}</Button
        >
        <Button
          variant="ghost"
          size="icon"
          aria-label="退出登录"
          onclick={() => auth.logout(clearCache)}
          ><LogOut aria-hidden="true" /></Button
        >
      </div>
    </header>
    <main
      id="main"
      class="mx-auto max-w-7xl px-4 pt-2 pb-[calc(156px+env(safe-area-inset-bottom))] sm:px-8"
    >
      {#if !authorized}
        <Empty
          title="当前账号没有访问权限"
          description="请使用已授权的本人账号登录。"
        />
      {:else if path === "/"}
        {#await import("./pages/Overview.svelte")}<Loading
          />{:then page}<page.default {hidden} />{/await}
      {:else if path === "/transactions" || path.startsWith("/transactions/")}
        {#await import("./pages/Transactions.svelte")}<Loading
          />{:then page}<page.default {hidden} />{/await}
        {#if path.startsWith("/transactions/")}
          {#await import("./pages/Editor.svelte")}<Loading
            />{:then page}{#key path}<page.default {hidden} />{/key}{/await}
        {/if}
      {:else if path === "/accounts"}
        {#await import("./pages/Accounts.svelte")}<Loading
          />{:then page}<page.default />{/await}
      {:else}
        <Empty title="页面不存在" description="返回总览继续查看账本。"
          ><Button href="/">回到总览</Button></Empty
        >
      {/if}
    </main>
  </div>
  {#if authorized && !path.startsWith("/transactions/")}
    <Button
      href="/transactions/new"
      class="fixed right-5 bottom-[calc(88px+env(safe-area-inset-bottom))] z-20 rounded-full px-6 shadow-lg md:right-10 md:bottom-8"
      ><Plus aria-hidden="true" />记一笔</Button
    >
  {/if}
  <nav
    aria-label="移动导航"
    class="fixed inset-x-0 bottom-0 z-30 flex h-[calc(68px+env(safe-area-inset-bottom))] items-start justify-around border-t bg-background pt-2 pb-[env(safe-area-inset-bottom)] md:hidden"
  >
    {#each nav as item}<a
        href={item.path}
        aria-current={(
          item.path === "/" ? path === "/" : path.startsWith(item.path)
        )
          ? "page"
          : undefined}
        class="flex min-h-12 min-w-16 flex-col items-center justify-center gap-1 text-xs text-muted-foreground aria-[current=page]:text-primary"
        ><item.icon class="size-5" aria-hidden="true" />{item.label}</a
      >{/each}
  </nav>
{/if}
