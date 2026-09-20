// Keep keyboard focus inside a form sheet's field scroller, without moving its chrome.
export function keepFocusVisible(node: HTMLElement) {
  let frame = 0;
  const reveal = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const focused = document.activeElement;
      if (!(focused instanceof HTMLElement) || !node.contains(focused)) return;
      const field = focused.getBoundingClientRect();
      const area = node.getBoundingClientRect();
      if (field.bottom > area.bottom)
        node.scrollTop += field.bottom - area.bottom + 16;
      else if (field.top < area.top)
        node.scrollTop -= area.top - field.top + 16;
    });
  };
  node.addEventListener("focusin", reveal);
  const observer = new ResizeObserver(reveal);
  observer.observe(node);
  return {
    destroy() {
      cancelAnimationFrame(frame);
      node.removeEventListener("focusin", reveal);
      observer.disconnect();
    },
  };
}
