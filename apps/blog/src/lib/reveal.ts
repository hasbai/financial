/** Reveal below-the-fold writing once it enters view; SSR content stays visible. */
export function reveal(node: HTMLElement, delay = 0) {
  if (
    typeof IntersectionObserver === "undefined" ||
    matchMedia("(prefers-reduced-motion: reduce)").matches ||
    node.getBoundingClientRect().top < innerHeight * 0.86
  ) return;
  node.style.setProperty("--reveal-delay", `${Math.min(delay, 12) * 30}ms`);
  node.dataset.reveal = "waiting";
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    node.dataset.reveal = "in";
    observer.disconnect();
  }, { rootMargin: "0px 0px -2% 0px" });
  observer.observe(node);
  return { destroy: () => observer.disconnect() };
}
