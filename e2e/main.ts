// A separate Vite entry. Never imported by src/main.ts or included in dist.
import { mount } from "svelte";
import { QueryClient } from "@tanstack/svelte-query";
import "../src/style.css";

const path = new URLSearchParams(location.search).get("path") || "/";
history.replaceState(null, "", path);
const [{ default: Harness }, { createRepository }, { trackMobileViewport }] =
  await Promise.all([
    import("../src/test/Harness.svelte"),
    import("../src/lib/api"),
    import("../src/lib/mobile-viewport"),
  ]);
const cache = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
trackMobileViewport();
mount(Harness, {
  target: document.getElementById("root")!,
  props: {
    page: "shell",
    cache,
    api: createRepository(async () => "visual-fixture-token", cache),
  },
});
