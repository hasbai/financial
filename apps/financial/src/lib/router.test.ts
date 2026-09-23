import { afterEach, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/svelte";
import { createRouter } from "./router.svelte";
const disposers: (() => void)[] = [];
afterEach(() => {
  disposers.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
});
function setup() {
  window.history.replaceState({ financialIndex: 0 }, "", "/");
  const router = createRouter();
  disposers.push(router.start());
  return router;
}
it("handles back and forward while retaining filter query strings", async () => {
  const router = setup();
  router.navigate("/transactions?review=needed");
  router.navigate("/transactions/7?review=needed");
  window.history.back();
  await waitFor(() => expect(router.location.pathname).toBe("/transactions"));
  expect(router.location.search).toBe("?review=needed");
  window.history.forward();
  await waitFor(() => expect(router.location.pathname).toBe("/transactions/7"));
});
it("restores the URL when history navigation is rejected by the editor", async () => {
  const router = setup();
  router.navigate("/transactions?review=needed");
  router.navigate("/transactions/7?review=needed");
  const guard = vi.fn(() => false);
  disposers.push(router.guard(guard));
  window.history.back();
  await waitFor(() => expect(guard).toHaveBeenCalled());
  await waitFor(() => expect(window.location.pathname).toBe("/transactions/7"));
  expect(router.location.pathname).toBe("/transactions/7");
});
it("blocks ordinary navigation while saving and allows explicit post-save replacement", () => {
  const router = setup();
  router.navigate("/transactions/new");
  disposers.push(router.guard(() => false));
  router.navigate("/accounts");
  expect(router.location.pathname).toBe("/transactions/new");
  router.navigate("/transactions/7", true, true);
  expect(router.location.pathname).toBe("/transactions/7");
});
