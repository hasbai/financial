<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "@hasbai/ui/button";
  import { Badge } from "@hasbai/ui/badge";
  import { type Api, type Node, type Report } from "../lib/types";
  let { api }: { api: Api } = $props();
  let nodes = $state<Node[]>([]),
    reports = $state<Report[]>([]),
    node = $state(""),
    loading = $state(true),
    error = $state("");
  onMount(() => {
    void init();
  });
  async function init() {
    try {
      nodes = (await api.request<{ nodes: Node[] }>("/admin/nodes")).nodes;
      await load();
    } catch (e) {
      error = (e as Error).message;
      loading = false;
    }
  }
  async function load() {
    loading = true;
    error = "";
    try {
      reports = (
        await api.request<{ reports: Report[] }>(
          `/admin/reports?limit=100${node ? "&node_id=" + node : ""}`,
        )
      ).reports;
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }
  function payload(raw: string) {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }
</script>

<div class="toolbar">
  <label for="report-node">节点</label><select
    id="report-node"
    class="select"
    bind:value={node}
    onchange={load}
    ><option value="">全部节点</option>{#each nodes as n}<option
        value={String(n.id)}>{n.name}</option
      >{/each}</select
  ><Badge variant="secondary">最近 {reports.length} 条</Badge>
</div>
{#if error}<div class="empty">
    <p class="error" role="alert">{error}</p>
    <Button onclick={init}>重试</Button>
  </div>{:else if loading}<div
    class="skeleton"
    role="status"
    aria-label="正在加载报告"
  ></div>{:else}<div class="panel">
    <div class="panel-body">
      {#each reports as report}<details class="binding" style="display:block">
          <summary class="actions" style="cursor:pointer;min-height:44px"
            ><Badge variant="outline"
              >{report.event === "report.traffic"
                ? "流量"
                : report.event === "node.status"
                  ? "节点状态"
                  : "设备报告"}</Badge
            ><strong
              >{nodes.find((n) => n.id === report.node_id)?.name ??
                "#" + report.node_id}</strong
            ><time class="muted"
              >{new Date(report.created_at * 1000).toLocaleString(
                "zh-CN",
              )}</time
            ></summary
          >
          <pre class="report-json mono">{payload(report.payload_json)}</pre>
        </details>{:else}<div class="empty"><h2>暂无报告</h2></div>{/each}
    </div>
  </div>{/if}
