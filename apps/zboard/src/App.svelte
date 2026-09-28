<script lang="ts">
  import { onMount } from "svelte";
  import { createBrowserClient } from "@hasbai/auth";
  import { Button } from "@hasbai/ui/button";
  import Panel from "./Panel.svelte";
  import { createApi } from "./lib/api";
  import type { Api } from "./lib/types";
  let loading = $state(true),
    authenticated = $state(false),
    error = $state("");
  let api = $state<Api>();
  let client: ReturnType<typeof createBrowserClient>;
  onMount(() => {
    void init();
  });
  async function init() {
    try {
      client = createBrowserClient(location.origin, {
        audience: "https://zboard.hasbai.xyz/api",
      });
      if (location.pathname === "/auth/callback") {
        await client.handleRedirectCallback();
        history.replaceState({}, "", "/");
      } else {
        try {
          await client.checkSession();
        } catch {
          /* Manual login remains available. */
        }
      }
      authenticated = await client.isAuthenticated();
      if (authenticated) api = createApi(() => client.getTokenSilently());
    } catch (e) {
      error = e instanceof Error ? e.message : "登录失败";
    } finally {
      loading = false;
    }
  }
  async function login() {
    error = "";
    try {
      await client.loginWithRedirect();
    } catch {
      error = "无法打开登录，请重试";
    }
  }
  async function logout() {
    authenticated = false;
    api = undefined;
    try {
      await client.logout({ logoutParams: { returnTo: location.origin } });
    } catch {
      error = "退出失败，请重试";
    }
  }
</script>

{#if authenticated && api}<Panel {api} {logout} />{:else}
  <main class="login">
    <div class="login-mark">Z</div>
    <p class="eyebrow">北极小站</p>
    <h1>Zboard</h1>
    {#if loading}<p role="status">正在恢复登录…</p>{:else}<Button
        onclick={login}>登录</Button
      >{/if}
    {#if error}<p role="alert">{error}</p>{/if}
  </main>
{/if}
