import { mount } from "svelte";
import Panel from "../src/Panel.svelte";
import { createApi } from "../src/lib/api";
import "../src/app.css";
mount(Panel, {
  target: document.getElementById("app")!,
  props: {
    api: createApi(async () => "test-only-token"),
    logout: () => {
      document.body.textContent = "已退出";
    },
  },
});
