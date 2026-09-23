// CSS dvh tracks browser chrome; VisualViewport additionally tracks the iOS keyboard.
export function trackMobileViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return () => {};
  const root = document.documentElement;
  let frame = 0;
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      // Preserve pinch zoom and the browser's own panning.
      if (viewport.scale !== 1) return;
      root.style.setProperty("--visual-height", `${viewport.height}px`);
      root.style.setProperty("--visual-top", `${viewport.offsetTop}px`);
    });
  };
  viewport.addEventListener("resize", update);
  viewport.addEventListener("scroll", update);
  update();
  return () => {
    cancelAnimationFrame(frame);
    viewport.removeEventListener("resize", update);
    viewport.removeEventListener("scroll", update);
    root.style.removeProperty("--visual-height");
    root.style.removeProperty("--visual-top");
  };
}
