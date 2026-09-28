<script lang="ts">
  import { guardUnsaved } from "../lib/unsaved";
  import { onMount } from "svelte";
  import { Button } from "@hasbai/ui/button";
  import { Input } from "@hasbai/ui/input";
  import { Textarea } from "@hasbai/ui/textarea";
  import { Badge } from "@hasbai/ui/badge";
  import { Plus, ArrowLeft } from "@lucide/svelte";
  import { type Api, type Template } from "../lib/types";
  import Confirm from "../lib/Confirm.svelte";
  let { api }: { api: Api } = $props();
  let items = $state<Template[]>([]),
    loading = $state(true),
    busy = $state(false),
    error = $state(""),
    notice = $state(""),
    search = $state(""),
    editing = $state(false),
    id = $state<number | null>(null),
    name = $state(""),
    protocol = $state("vless"),
    description = $state(""),
    config = $state("{}"),
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
      items = (await api.request<{ templates: Template[] }>("/admin/templates"))
        .templates;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }
  function edit(t?: Template) {
    id = t?.id ?? null;
    name = t?.name ?? "";
    protocol = t?.protocol ?? "vless";
    description = t?.description ?? "";
    config =
      t?.template_json ??
      JSON.stringify(
        {
          protocol: "vless",
          server_port: 443,
          network: "tcp",
          network_settings: { network: "tcp" },
          routes: [],
        },
        null,
        2,
      );
    editing = true;
    dirty = false;
    error = "";
  }
  function back() {
    if (dirty && !window.confirm("放弃未保存的修改？")) return;
    editing = false;
    dirty = false;
  }
  async function save(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = "";
    try {
      const template = JSON.parse(config);
      await api.request(
        id ? `/admin/templates/${id}` : "/admin/templates",
        id ? "PATCH" : "POST",
        { name, protocol, description, template },
      );
      editing = false;
      dirty = false;
      notice = "模板已保存";
      await load();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }
  async function remove() {
    busy = true;
    error = "";
    try {
      await api.request(`/admin/templates/${id}`, "DELETE");
      confirm = false;
      editing = false;
      dirty = false;
      notice = "模板已删除";
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
    aria-label="正在加载模板"
  ></div>{:else if editing}<div class="editor stack">
    <div class="actions">
      <Button variant="ghost" onclick={back} disabled={busy}
        ><ArrowLeft />返回</Button
      >
      <h2>{id ? "编辑模板" : "新增模板"}</h2>
    </div>
    <form class="stack" onsubmit={save} oninput={() => (dirty = true)}>
      <fieldset disabled={busy} class="panel">
        <div class="panel-body form-grid">
          <div class="field">
            <label for="template-name">模板名称</label><Input
              id="template-name"
              bind:value={name}
              required
              maxlength={100}
            />
          </div>
          <div class="field">
            <label for="template-protocol">协议</label><select
              id="template-protocol"
              bind:value={protocol}
              ><option value="vless">VLESS</option><option value="vmess"
                >VMess</option
              ><option value="trojan">Trojan</option><option value="shadowsocks"
                >Shadowsocks</option
              ></select
            >
          </div>
          <div class="field wide">
            <label for="description">备注</label><Input
              id="description"
              bind:value={description}
            />
          </div>
          <div class="field wide">
            <label for="template-json">配置模板（JSON）</label><Textarea
              id="template-json"
              class="json-editor"
              bind:value={config}
              required
              spellcheck="false"
            />
          </div>
        </div>
      </fieldset>
      <div class="save-bar">
        {#if id}<Button
            variant="destructive"
            onclick={() => (confirm = true)}
            disabled={busy}>删除模板</Button
          >{/if}<Button variant="outline" onclick={back} disabled={busy}
          >取消</Button
        ><Button type="submit" disabled={busy}
          >{busy ? "处理中…" : "保存模板"}</Button
        >
      </div>
    </form>
  </div>
{:else}<div class="toolbar">
    <Input
      aria-label="搜索模板"
      placeholder="搜索模板"
      bind:value={search}
    /><Button onclick={() => edit()}><Plus />新增模板</Button>{#if error}<Button
        variant="outline"
        onclick={load}>重试</Button
      >{/if}
  </div>
  <div class="panel">
    <div class="table-scroll">
      <table class="rows">
        <thead><tr><th>模板</th><th>协议</th><th>操作</th></tr></thead><tbody
          >{#each items.filter((t) => t.name
              .toLowerCase()
              .includes(search.toLowerCase())) as t}<tr
              ><td
                ><strong>{t.name}</strong>{#if t.description}<p
                    class="muted wrap"
                  >
                    {t.description}
                  </p>{/if}</td
              ><td
                ><Badge variant="outline">{t.protocol.toUpperCase()}</Badge></td
              ><td
                ><Button
                  variant="outline"
                  aria-label={"编辑模板 " + t.name}
                  onclick={() => edit(t)}>编辑</Button
                ></td
              ></tr
            >{/each}</tbody
        >
      </table>
    </div>
    {#if !items.filter((t) => t.name
        .toLowerCase()
        .includes(search.toLowerCase())).length}<div class="empty">
        <h2>{search ? "没有匹配的模板" : "尚未添加模板"}</h2>
        {#if !search}<Button onclick={() => edit()}>添加模板</Button>{/if}
      </div>{/if}
  </div>{/if}
<Confirm
  bind:open={confirm}
  title={"删除模板“" + name + "”？"}
  {busy}
  onconfirm={remove}
/>
