<script lang="ts">
  import { guardUnsaved } from "../lib/unsaved";
  import { onMount } from "svelte";
  import { Button } from "@hasbai/ui/button";
  import { Input } from "@hasbai/ui/input";
  import { Textarea } from "@hasbai/ui/textarea";
  import { Badge } from "@hasbai/ui/badge";
  import { Plus, ArrowLeft, Copy } from "@lucide/svelte";
  import { type Api, type Node, type User, type Template } from "../lib/types";
  import Confirm from "../lib/Confirm.svelte";
  import { clientConfig, type ClientConfig } from "../../worker/subscription";
  let { api }: { api: Api } = $props();
  let nodes = $state<Node[]>([]),
    users = $state<User[]>([]),
    templates = $state<Template[]>([]),
    loading = $state(true),
    busy = $state(false),
    error = $state(""),
    notice = $state(""),
    search = $state("");
  let editing = $state(false),
    id = $state<number | null>(null),
    name = $state(""),
    protocol = $state("vless"),
    enabled = $state(true),
    config = $state("{}"),
    token = $state(""),
    reveal = $state(false),
    client = $state<ClientConfig>(clientConfig({})),
    templateId = $state(""),
    vars = $state("{}"),
    assigned = $state<number[]>([]),
    confirm = $state(false),
    dirty = $state(false);
  const filtered = $derived(
    nodes.filter((n) =>
      `${n.name} ${n.node_type}`.toLowerCase().includes(search.toLowerCase()),
    ),
  );
  onMount(() => {
    void load();
    return guardUnsaved(() => dirty);
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
  function fresh() {
    id = null;
    name = "";
    protocol = "vless";
    enabled = true;
    config = JSON.stringify(
      {
        protocol: "vless",
        listen_ip: "0.0.0.0",
        server_port: 443,
        network: "tcp",
        network_settings: { network: "tcp" },
        routes: [],
      },
      null,
      2,
    );
    token = "";
    client = clientConfig({});
    templateId = "";
    vars = "{}";
    assigned = [];
    error = "";
    notice = "";
    editing = true;
    dirty = false;
  }
  async function edit(node: Node) {
    busy = true;
    error = "";
    try {
      const { node: n } = await api.request<{
        node: Node & {
          token: string;
          config: Record<string, unknown>;
          client: ClientConfig;
          assigned_users: User[];
        };
      }>(`/admin/nodes/${node.id}`);
      fresh();
      id = n.id;
      name = n.name;
      protocol = n.node_type;
      enabled = !!n.enabled;
      config = JSON.stringify(n.config, null, 2);
      client = clientConfig(n.client);
      token = n.token;
      templateId = n.config_template_id ? String(n.config_template_id) : "";
      assigned = n.assigned_users.map((u) => u.id);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  function back() {
    if (dirty && !window.confirm("放弃未保存的修改？")) return;
    editing = false;
    dirty = false;
    error = "";
  }
  async function render() {
    busy = true;
    error = "";
    try {
      const result = await api.request<{
        config: Record<string, unknown>;
        protocol: string;
      }>(`/admin/templates/${templateId}/render`, "POST", {
        vars: JSON.parse(vars),
      });
      config = JSON.stringify(result.config, null, 2);
      protocol = result.protocol;
      dirty = true;
      notice = "模板已载入，保存后生效";
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function save(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = "";
    let saved = false;
    try {
      const body = {
        name,
        node_type: protocol,
        enabled,
        config: JSON.parse(config),
        client,
        config_template_id: templateId ? Number(templateId) : null,
        ...(token ? { token } : {}),
      };
      await api.request(
        id ? `/admin/nodes/${id}` : "/admin/nodes",
        id ? "PATCH" : "POST",
        body,
      );
      saved = true;
      dirty = false;
      editing = false;
      notice = "节点已保存";
      await load();
    } catch (e) {
      error = (saved ? "已保存，刷新失败：" : "") + (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function remove() {
    busy = true;
    error = "";
    try {
      await api.request(`/admin/nodes/${id}`, "DELETE");
      confirm = false;
      editing = false;
      dirty = false;
      notice = "节点已删除";
      await load();
    } catch (e) {
      error = (e as Error).message;
      confirm = false;
    } finally {
      busy = false;
    }
  }
  async function bind(userId: number) {
    busy = true;
    error = "";
    try {
      const exists = assigned.includes(userId);
      await api.request(
        `/admin/nodes/${id}/users/${userId}`,
        exists ? "DELETE" : "POST",
      );
      assigned = exists
        ? assigned.filter((x) => x !== userId)
        : [...assigned, userId];
      notice = "用户分配已保存";
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function push() {
    busy = true;
    error = "";
    try {
      await api.request(`/admin/nodes/${id}/push`, "POST");
      notice = "已请求同步";
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(token);
      notice = "节点密钥已复制";
    } catch {
      error = "复制失败";
    }
  }
</script>

{#if notice}<p role="status" class="notice mb-5">{notice}</p>{/if}{#if error}<p
    role="alert"
    class="error mb-5"
  >
    {error}
  </p>{/if}
{#if loading}<div
    class="skeleton"
    role="status"
    aria-label="正在加载节点"
  ></div>
{:else if editing}
  <div class="editor stack">
    <div class="actions">
      <Button variant="ghost" onclick={back} disabled={busy}
        ><ArrowLeft />返回</Button
      >
      <h2>{id ? "编辑节点" : "新增节点"}</h2>
    </div>
    <form onsubmit={save} oninput={() => (dirty = true)} class="stack">
      <fieldset disabled={busy} class="panel">
        <div class="panel-head">
          <h2>节点配置</h2>
          <label class="toggle-line"
            ><input type="checkbox" bind:checked={enabled} />启用</label
          >
        </div>
        <div class="panel-body form-grid">
          <div class="field">
            <label for="node-name">节点名称</label><Input
              id="node-name"
              bind:value={name}
              required
              maxlength={100}
            />
          </div>
          <div class="field">
            <label for="node-protocol">协议</label><select
              id="node-protocol"
              bind:value={protocol}
              ><option value="vless">VLESS</option><option value="vmess"
                >VMess</option
              ><option value="trojan">Trojan</option><option value="shadowsocks"
                >Shadowsocks</option
              ></select
            >
          </div>
          <div class="field wide">
            <label for="node-token">节点密钥</label>
            <div class="actions">
              <Input
                id="node-token"
                type={reveal ? "text" : "password"}
                bind:value={token}
                placeholder={id ? "" : "自动生成"}
                class="min-w-0 flex-1"
                autocomplete="off"
              /><Button variant="outline" onclick={() => (reveal = !reveal)}
                >{reveal ? "隐藏" : "显示"}</Button
              >{#if id}<Button
                  variant="outline"
                  aria-label="复制节点密钥"
                  onclick={copy}><Copy /></Button
                >{/if}
            </div>
          </div>
          <div class="field">
            <label for="template">配置模板</label><select
              id="template"
              bind:value={templateId}
              ><option value="">自定义</option>{#each templates as t}<option
                  value={String(t.id)}>{t.name}</option
                >{/each}</select
            >
          </div>
          {#if templateId}<div class="field">
              <label for="template-vars">模板变量（JSON）</label><Textarea
                id="template-vars"
                bind:value={vars}
              /><Button variant="outline" onclick={render}>载入模板</Button>
            </div>{/if}
          <div class="field wide">
            <label for="node-config">服务端配置（JSON）</label><Textarea
              id="node-config"
              class="json-editor"
              bind:value={config}
              required
              spellcheck="false"
            />
          </div>
        </div>
      </fieldset>
      <fieldset disabled={busy} class="panel">
        <div class="panel-head"><h2>订阅连接参数</h2></div>
        <div class="panel-body form-grid">
          <div class="field">
            <label for="server">服务器地址</label><Input
              id="server"
              bind:value={client.server}
              required
              placeholder="node.example.com"
            />
          </div>
          <div class="field">
            <label for="port">连接端口</label><Input
              id="port"
              type="number"
              min="1"
              max="65535"
              bind:value={client.port}
              required
            />
          </div>
          <div class="field">
            <label for="security">连接安全</label><select
              id="security"
              bind:value={client.security}
              ><option value="none">无 TLS</option><option value="tls"
                >TLS</option
              ><option value="reality">REALITY</option></select
            >
          </div>
          <div class="field">
            <label for="network">传输方式</label><select
              id="network"
              bind:value={client.network}
              ><option value="tcp">TCP</option><option value="ws"
                >WebSocket</option
              ><option value="grpc">gRPC</option></select
            >
          </div>
          {#if client.security !== "none"}<div class="field">
              <label for="sni">SNI</label><Input
                id="sni"
                bind:value={client.sni}
              />
            </div>
            <div class="field">
              <label for="fingerprint">TLS 指纹</label><Input
                id="fingerprint"
                bind:value={client.fingerprint}
              />
            </div>{/if}
          {#if client.security === "reality"}<div class="field">
              <label for="public-key">REALITY 公钥</label><Input
                id="public-key"
                bind:value={client.public_key}
                required
              />
            </div>
            <div class="field">
              <label for="short-id">Short ID</label><Input
                id="short-id"
                bind:value={client.short_id}
              />
            </div>{/if}
          {#if protocol === "vless"}<div class="field">
              <label for="flow">Flow</label><select
                id="flow"
                bind:value={client.flow}
                ><option value="">无</option><option value="xtls-rprx-vision"
                  >xtls-rprx-vision</option
                ></select
              >
            </div>{/if}
          {#if client.network === "ws"}<div class="field">
              <label for="ws-path">WebSocket 路径</label><Input
                id="ws-path"
                bind:value={client.path}
              />
            </div>
            <div class="field">
              <label for="ws-host">WebSocket Host</label><Input
                id="ws-host"
                bind:value={client.host}
              />
            </div>{/if}
          {#if client.network === "grpc"}<div class="field">
              <label for="service">gRPC Service Name</label><Input
                id="service"
                bind:value={client.service_name}
              />
            </div>{/if}
          {#if protocol === "shadowsocks"}<div class="field">
              <label for="cipher">加密方式</label><select
                id="cipher"
                bind:value={client.cipher}
                ><option>aes-128-gcm</option><option>aes-256-gcm</option><option
                  >chacha20-ietf-poly1305</option
                ></select
              >
            </div>{/if}
        </div>
      </fieldset>
      <div class="save-bar">
        {#if id}<Button
            variant="destructive"
            disabled={busy}
            onclick={() => (confirm = true)}>删除节点</Button
          >{/if}<Button variant="outline" disabled={busy} onclick={back}
          >取消</Button
        ><Button type="submit" disabled={busy}
          >{busy ? "处理中…" : "保存节点"}</Button
        >
      </div>
    </form>
    {#if id}<section class="panel">
        <div class="panel-head">
          <h2>分配用户</h2>
          <Badge variant="secondary">{assigned.length}</Badge>
        </div>
        <div class="panel-body">
          {#each users as u}<div class="binding">
              <div class="wrap">
                <h3>{u.email}</h3>
                <span class="muted">{u.enabled ? "已启用" : "待启用"}</span>
              </div>
              <Button
                variant={assigned.includes(u.id) ? "secondary" : "outline"}
                disabled={busy}
                onclick={() => bind(u.id)}
                >{assigned.includes(u.id) ? "移除" : "分配"}</Button
              >
            </div>{:else}<div class="empty">暂无用户</div>{/each}
        </div>
      </section>
      <div class="actions">
        <Button variant="outline" disabled={busy} onclick={push}
          >请求同步</Button
        >
      </div>{/if}
  </div>
{:else}
  <div class="toolbar">
    <Input
      aria-label="搜索节点"
      placeholder="搜索节点"
      bind:value={search}
    /><Button onclick={fresh}><Plus />新增节点</Button>{#if error}<Button
        variant="outline"
        onclick={load}>重试</Button
      >{/if}
  </div>
  <section class="panel">
    <div class="table-scroll">
      <table class="rows">
        <thead
          ><tr><th>节点</th><th>状态</th><th>用户</th><th>操作</th></tr></thead
        ><tbody
          >{#each filtered as n}<tr
              ><td
                ><strong>{n.name}</strong>
                <div class="muted">{n.node_type.toUpperCase()}</div></td
              ><td
                ><Badge variant={n.enabled ? "secondary" : "outline"}
                  >{n.enabled ? "启用" : "停用"}</Badge
                ></td
              ><td>{n.user_count}</td><td
                ><Button
                  variant="outline"
                  disabled={busy}
                  onclick={() => edit(n)}
                  aria-label={"编辑节点 " + n.name}>编辑</Button
                ></td
              ></tr
            >{/each}</tbody
        >
      </table>
    </div>
    {#if !filtered.length}<div class="empty">
        <h2>{search ? "没有匹配的节点" : "尚未添加节点"}</h2>
        {#if !search}<Button onclick={fresh}>添加节点</Button>{/if}
      </div>{/if}
  </section>
{/if}
<Confirm
  bind:open={confirm}
  title={"删除节点“" + name + "”？"}
  {busy}
  onconfirm={remove}
/>
