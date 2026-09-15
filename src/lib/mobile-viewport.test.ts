import { expect, it, vi } from "vitest";
import { trackMobileViewport } from "./mobile-viewport";
it("tracks keyboard viewport offsets, preserves pinch zoom and removes listeners", () => {
  const events = new Map<string, () => void>();
  const viewport = {
    height: 400,
    offsetTop: 20,
    scale: 1,
    addEventListener: vi.fn((name: string, fn: () => void) =>
      events.set(name, fn),
    ),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("visualViewport", viewport);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((fn) => {
    fn(0);
    return 1;
  });
  const cleanup = trackMobileViewport();
  expect(
    document.documentElement.style.getPropertyValue("--visual-height"),
  ).toBe("400px");
  viewport.height = 250;
  viewport.offsetTop = 40;
  events.get("resize")?.();
  expect(document.documentElement.style.getPropertyValue("--visual-top")).toBe(
    "40px",
  );
  viewport.scale = 2;
  viewport.height = 100;
  events.get("resize")?.();
  expect(
    document.documentElement.style.getPropertyValue("--visual-height"),
  ).toBe("250px");
  cleanup();
  expect(viewport.removeEventListener).toHaveBeenCalledTimes(2);
  expect(
    document.documentElement.style.getPropertyValue("--visual-height"),
  ).toBe("");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
