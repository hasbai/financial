<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "@hasbai/ui/button";
  import { Badge } from "@hasbai/ui/badge";
  import {
    bytes,
    type Api,
    type Node,
    type User,
    type Template,
  } from "../lib/types";
  let { api, hidden }: { api: Api; hidden: boolean } = $props();
  let loading = $state(true),
    error = $state(""),
    nodes = $state<Node[]>([]),
    users = $state<User[]>([]),
    templates = $state<Template[]>([]);
  onMount(() => {
    void load();
  });
  async function load() {
    loading = true;
    error = "";
    try {
      const [n, u, t] = await Promise.all([
        api.request<{ nodes: Node[] }>("/admin/nodes"),
        api.request<{ users: User[] }>("/admin/users"),
        api.request<{ templates: Template[] }>("/admin/templates"),
      ]);
      nodes = n.nodes;
      users = u.users;
      templates = t.templates;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }
</script>

{#if loading}<div
    class="skeleton"
    role="status"
    aria-label="正在加载总览"
  ></div>{:else if error}<div class="empty">
    <p role="alert" class="error">{error}</p>
    <Button onclick={load}>重试</Button>
  </div>{:else}
  <div class="stack">
    <div class="stats">
      <div class="stat">
        <span class="muted">启用节点 / 全部</span><strong
          >{nodes.filter((n) => n.enabled).length}<span
            class="muted"
            style="font-size:18px"
          >
            / {nodes.length}</span
          ></strong
        >
      </div>
      <div class="stat">
        <span class="muted">启用用户 / 全部</span><strong
          >{users.filter((u) => u.enabled).length}<span
            class="muted"
            style="font-size:18px"
          >
            / {users.length}</span
          ></strong
        >
      </div>
      <div class="stat">
        <span class="muted">累计流量</span><strong
          >{hidden
            ? "••••"
            : bytes(
                users.reduce((sum, u) => sum + u.upload + u.download, 0),
              )}</strong
        >
      </div>
    </div>
    <div class="split">
      <section class="panel">
        <div class="panel-head">
          <h2>节点</h2>
          <Button variant="ghost" href="#nodes">管理节点</Button>
        </div>
        <div class="panel-body">
          {#each nodes as node}<div class="binding">
              <div>
                <h3>{node.name}</h3>
                <span class="muted"
                  >{node.node_type.toUpperCase()} · {node.user_count} 位用户</span
                >
              </div>
              <Badge variant={node.enabled ? "secondary" : "outline"}
                >{node.enabled ? "已启用" : "已停用"}</Badge
              >
            </div>{:else}<div class="empty">
              <h3>尚未添加节点</h3>
              <Button href="#nodes">添加节点</Button>
            </div>{/each}
        </div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>待处理</h2></div>
        <div class="panel-body stack">
          <div class="binding">
            <span>待启用用户</span><Button variant="outline" href="#members"
              >{users.filter((u) => !u.enabled).length}</Button
            >
          </div>
          <div class="binding">
            <span>配置模板</span><Button variant="outline" href="#templates"
              >{templates.length}</Button
            >
          </div>
        </div>
      </section>
    </div>
  </div>
{/if}
