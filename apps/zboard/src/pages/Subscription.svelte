<script lang="ts">
  import { Button } from "@hasbai/ui/button";
  import { Badge } from "@hasbai/ui/badge";
  import * as Card from "@hasbai/ui/card";
  import { Copy, RotateCw, Server, Link } from "@lucide/svelte";
  import { bytes, expiry, status, type Api, type Me } from "../lib/types";
  import Confirm from "../lib/Confirm.svelte";
  let {
    api,
    me,
    hidden,
    onrefresh,
  }: { api: Api; me: Me; hidden: boolean; onrefresh: () => Promise<void> } =
    $props();
  let format = $state("base64"),
    notice = $state(""),
    error = $state(""),
    confirm = $state(false),
    busy = $state(false);
  const url = $derived(
    me.subscription_url ? `${me.subscription_url}?format=${format}` : "",
  );
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      notice = "已复制订阅链接";
    } catch {
      error = "复制失败，请手动复制链接";
    }
  }
  async function rotate() {
    busy = true;
    error = "";
    try {
      await api.request("/me/rotate", "POST");
      confirm = false;
      notice = "订阅链接已重置";
      await onrefresh();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
</script>

<div class="stack">
  <div class="stats">
    <div class="stat">
      <span class="muted">已用流量</span><strong
        >{hidden ? "••••" : bytes(me.user.upload + me.user.download)}</strong
      >{#if me.user.transfer_enable > 0}<div
          class="progress"
          role="progressbar"
          aria-label="流量使用比例"
          aria-valuenow={hidden
            ? undefined
            : Math.min(
                100,
                Math.round(
                  ((me.user.upload + me.user.download) /
                    me.user.transfer_enable) *
                    100,
                ),
              )}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span
            style:width={hidden
              ? "0%"
              : `${Math.min(100, ((me.user.upload + me.user.download) / me.user.transfer_enable) * 100)}%`}
          ></span>
        </div>{/if}
    </div>
    <div class="stat">
      <span class="muted">流量额度</span><strong
        >{hidden
          ? "••••"
          : me.user.transfer_enable
            ? bytes(me.user.transfer_enable)
            : "不限流量"}</strong
      >
    </div>
    <div class="stat">
      <span class="muted">有效期</span><strong style="font-size:24px"
        >{expiry(me.user.expired_at)}</strong
      ><Badge variant="secondary">{status(me.user)}</Badge>
    </div>
  </div>
  {#if notice}<p role="status" class="notice">{notice}</p>{/if}{#if error}<p
      role="alert"
      class="error"
    >
      {error}
    </p>{/if}
  <Card.Root
    ><Card.Header><Card.Title>订阅链接</Card.Title></Card.Header><Card.Content>
      {#if url}<div class="stack">
          <div class="actions">
            <label for="format">客户端格式</label><select
              id="format"
              class="select"
              bind:value={format}
              ><option value="base64">通用订阅</option><option value="clash"
                >Clash / Mihomo</option
              ><option value="uri">原始链接</option></select
            >
          </div>
          <div class="subscription-link">
            <Link size={18} /><code>{url}</code><Button onclick={copy}
              ><Copy size={16} />复制</Button
            >
          </div>
          <div class="actions">
            <Button variant="outline" onclick={() => (confirm = true)}
              ><RotateCw size={16} />重置链接</Button
            >
          </div>
        </div>
      {:else}<div class="empty">
          <Link size={28} class="muted" />
          <h2>
            {status(me.user) === "使用中" ? "暂无可用节点" : status(me.user)}
          </h2>
        </div>{/if}
    </Card.Content></Card.Root
  >
  <section class="panel">
    <div class="panel-head">
      <h2>可用节点</h2>
      <Badge variant="secondary">{me.nodes.length}</Badge>
    </div>
    <div class="panel-body">
      {#each me.nodes as node}<div class="binding">
          <div class="actions">
            <Server size={18} /><strong>{node.name}</strong>
          </div>
          <Badge variant="outline">{node.node_type.toUpperCase()}</Badge>
        </div>{:else}<div class="empty">
          <p class="muted">暂无节点</p>
        </div>{/each}
    </div>
  </section>
  <p class="muted mono">用户 ID · {me.user.auth0_sub}</p>
</div>
<Confirm
  bind:open={confirm}
  title="重置订阅链接？原链接将立即失效。"
  {busy}
  onconfirm={rotate}
/>
