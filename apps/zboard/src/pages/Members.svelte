<script lang="ts">
  import { guardUnsaved } from "../lib/unsaved";
  import { onMount } from "svelte";
  import { Button } from "@hasbai/ui/button";
  import { Input } from "@hasbai/ui/input";
  import { Badge } from "@hasbai/ui/badge";
  import { ArrowLeft } from "@lucide/svelte";
  import {
    bytes,
    status,
    expiry,
    type Api,
    type User,
    type Node,
  } from "../lib/types";
  import Confirm from "../lib/Confirm.svelte";
  let { api, hidden }: { api: Api; hidden: boolean } = $props();
  let users = $state<User[]>([]),
    nodes = $state<Node[]>([]),
    selected = $state<User | null>(null),
    loading = $state(true),
    busy = $state(false),
    error = $state(""),
    notice = $state(""),
    search = $state(""),
    enabled = $state(false),
    quota = $state(0),
    speed = $state(0),
    devices = $state(0),
    expires = $state(""),
    assigned = $state<number[]>([]),
    confirm = $state(false),
    dirty = $state(false);
  onMount(() => {
    void load();
    return guardUnsaved(() => dirty);
  });
  async function load() {
    loading = true;
    error = "";
    try {
      const [u, n] = await Promise.all([
        api.request<{ users: User[] }>("/admin/users"),
        api.request<{ nodes: Node[] }>("/admin/nodes"),
      ]);
      users = u.users;
      nodes = n.nodes;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }
  async function edit(u: User) {
    busy = true;
    error = "";
    try {
      const details = await Promise.all(
        nodes.map((n) =>
          api.request<{ node: Node & { assigned_users: User[] } }>(
            `/admin/nodes/${n.id}`,
          ),
        ),
      );
      assigned = details
        .filter((n) => n.node.assigned_users.some((x) => x.id === u.id))
        .map((n) => n.node.id);
      selected = u;
      enabled = !!u.enabled;
      quota = u.transfer_enable / 1024 ** 3;
      speed = u.speed_limit;
      devices = u.device_limit;
      expires = u.expired_at
        ? new Date(u.expired_at * 1000).toISOString().slice(0, 16)
        : "";
      dirty = false;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  function back() {
    if (dirty && !window.confirm("放弃未保存的修改？")) return;
    selected = null;
    dirty = false;
  }
  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!selected) return;
    busy = true;
    error = "";
    try {
      await api.request(`/admin/users/${selected.id}`, "PATCH", {
        enabled,
        transfer_enable: Math.round(quota * 1024 ** 3),
        speed_limit: speed,
        device_limit: devices,
        expired_at: expires
          ? Math.floor(new Date(expires + "Z").getTime() / 1000)
          : null,
      });
      selected = null;
      dirty = false;
      notice = "用户已保存";
      await load();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function bind(nodeId: number) {
    if (!selected) return;
    busy = true;
    error = "";
    try {
      const exists = assigned.includes(nodeId);
      await api.request(
        `/admin/nodes/${nodeId}/users/${selected.id}`,
        exists ? "DELETE" : "POST",
      );
      assigned = exists
        ? assigned.filter((x) => x !== nodeId)
        : [...assigned, nodeId];
      notice = "节点分配已保存";
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function remove() {
    if (!selected) return;
    busy = true;
    error = "";
    try {
      await api.request(`/admin/users/${selected.id}`, "DELETE");
      selected = null;
      dirty = false;
      confirm = false;
      notice = "用户已删除";
      await load();
    } catch (e) {
      error = (e as Error).message;
      confirm = false;
    } finally {
      busy = false;
    }
  }
</script>

{#if notice}<p class="notice mb-5" role="status">{notice}</p>{/if}{#if error}<p
    class="error mb-5"
    role="alert"
  >
    {error}
  </p>{/if}
{#if loading}<div
    class="skeleton"
    role="status"
    aria-label="正在加载用户"
  ></div>{:else if selected}<div class="editor stack">
    <div class="actions">
      <Button variant="ghost" disabled={busy} onclick={back}
        ><ArrowLeft />返回</Button
      >
      <h2 class="wrap">{selected.email}</h2>
    </div>
    <form class="stack" onsubmit={save} oninput={() => (dirty = true)}>
      <fieldset disabled={busy} class="panel">
        <div class="panel-head">
          <h2>订阅权限</h2>
          <label class="toggle-line"
            ><input type="checkbox" bind:checked={enabled} />启用</label
          >
        </div>
        <div class="panel-body form-grid">
          <div class="field wide">
            <label for="auth-id">Auth0 用户 ID</label><Input
              id="auth-id"
              value={selected.auth0_sub}
              readonly
            />
          </div>
          <div class="field">
            <label for="quota">流量额度（GB，0 为不限）</label><Input
              id="quota"
              type="number"
              min="0"
              step="any"
              bind:value={quota}
              required
            />
          </div>
          <div class="field">
            <label for="expires">到期时间（UTC）</label><Input
              id="expires"
              type="datetime-local"
              bind:value={expires}
            />
          </div>
          <div class="field">
            <label for="speed">速率上限（Mbps，0 为不限）</label><Input
              id="speed"
              type="number"
              min="0"
              step="1"
              bind:value={speed}
              required
            />
          </div>
          <div class="field">
            <label for="devices">设备上限（0 为不限）</label><Input
              id="devices"
              type="number"
              min="0"
              step="1"
              bind:value={devices}
              required
            />
          </div>
        </div>
      </fieldset>
      <div class="save-bar">
        <Button
          variant="destructive"
          disabled={busy}
          onclick={() => (confirm = true)}>删除用户</Button
        ><Button variant="outline" disabled={busy} onclick={back}>取消</Button
        ><Button type="submit" disabled={busy}
          >{busy ? "处理中…" : "保存用户"}</Button
        >
      </div>
    </form>
    <section class="panel">
      <div class="panel-head">
        <h2>分配节点</h2>
        <Badge variant="secondary">{assigned.length}</Badge>
      </div>
      <div class="panel-body">
        {#each nodes as n}<div class="binding">
            <div class="wrap">
              <strong>{n.name}</strong>
              <p class="muted">
                {n.node_type.toUpperCase()} · {n.enabled ? "启用" : "停用"}
              </p>
            </div>
            <Button
              variant={assigned.includes(n.id) ? "secondary" : "outline"}
              disabled={busy}
              onclick={() => bind(n.id)}
              >{assigned.includes(n.id) ? "移除" : "分配"}</Button
            >
          </div>{:else}<div class="empty">
            <Button href="#nodes">添加节点</Button>
          </div>{/each}
      </div>
    </section>
  </div>
{:else}<div class="toolbar">
    <Input
      aria-label="搜索用户"
      placeholder="搜索邮箱或用户 ID"
      bind:value={search}
    /><Badge variant="secondary">{users.length} 位用户</Badge>{#if error}<Button
        variant="outline"
        onclick={load}>重试</Button
      >{/if}
  </div>
  <div class="panel">
    <div class="table-scroll">
      <table class="rows">
        <thead
          ><tr><th>用户</th><th>状态</th><th>已用 / 额度</th><th>操作</th></tr
          ></thead
        ><tbody
          >{#each users.filter((u) => `${u.email} ${u.auth0_sub}`
              .toLowerCase()
              .includes(search.toLowerCase())) as u}<tr
              ><td
                ><strong>{u.email}</strong>
                <p class="muted">{expiry(u.expired_at)}</p></td
              ><td><Badge variant="secondary">{status(u)}</Badge></td><td
                class="mono"
                >{hidden
                  ? "••••"
                  : bytes(u.upload + u.download) +
                    " / " +
                    (u.transfer_enable ? bytes(u.transfer_enable) : "不限")}</td
              ><td
                ><Button
                  variant="outline"
                  disabled={busy}
                  onclick={() => edit(u)}
                  aria-label={"编辑用户 " + u.email}>编辑</Button
                ></td
              ></tr
            >{/each}</tbody
        >
      </table>
    </div>
    {#if !users.length}<div class="empty">
        <h2>暂无用户</h2>
      </div>{:else if !users.some((u) => `${u.email} ${u.auth0_sub}`
        .toLowerCase()
        .includes(search.toLowerCase()))}<div class="empty">
        没有匹配的用户
      </div>{/if}
  </div>{/if}
<Confirm
  bind:open={confirm}
  title={"删除用户“" + (selected?.email ?? "") + "”？"}
  {busy}
  onconfirm={remove}
/>
