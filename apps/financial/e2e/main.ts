// A separate compiled test entry in dist-e2e, never included in shipping dist.
import { mount } from "svelte";
import { QueryClient } from "@tanstack/svelte-query";
import "../src/style.css";

const params = new URLSearchParams(location.search);
const authorized = params.get("authorized") !== "false";
const path = params.get("path") || "/";
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
    authorized,
    cache,
    api: createRepository(async () => "visual-fixture-token", cache),
  },
});
