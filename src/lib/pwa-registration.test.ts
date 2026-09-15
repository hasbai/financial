import { afterEach, expect, it, vi } from "vitest";
import { registerPwa } from "./pwa";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("checks updates on launch and foreground without reloading documents, and deduplicates checks", async () => {
  const events: Record<string, EventListener> = {};
  vi.spyOn(window, "addEventListener").mockImplementation((name, callback) => {
    events[name] = callback as EventListener;
  });
  vi.spyOn(document, "addEventListener").mockImplementation(
    (name, callback) => {
      events[name] = callback as EventListener;
    },
  );
  let resolveUpdate!: () => void;
  const update = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveUpdate = resolve;
      }),
  );
  const register = vi.fn().mockResolvedValue({ update });
  vi.stubGlobal("navigator", { serviceWorker: { register }, onLine: true });
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  registerPwa();
  await vi.waitFor(() => expect(update).toHaveBeenCalledTimes(1));
  expect(register).toHaveBeenCalledWith("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  events.pageshow(new Event("pageshow"));
  expect(update).toHaveBeenCalledTimes(1);
  resolveUpdate();
  await Promise.resolve();
  events.visibilitychange(new Event("visibilitychange"));
  expect(update).toHaveBeenCalledTimes(2);
  resolveUpdate();
  await Promise.resolve();
  update.mockRejectedValueOnce(new Error("offline"));
  events.online(new Event("online"));
  await Promise.resolve();
  events.pageshow(new Event("pageshow"));
  expect(update).toHaveBeenCalledTimes(4);
  expect(events.controllerchange).toBeUndefined();
});
