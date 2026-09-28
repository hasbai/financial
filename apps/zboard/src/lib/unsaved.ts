/** Guard both browser unload and in-app links while an editor contains changes. */
export function guardUnsaved(dirty: () => boolean) {
  const unload = (e: BeforeUnloadEvent) => {
    if (dirty()) e.preventDefault();
  };
  const click = (e: MouseEvent) => {
    if (!(e.target instanceof Element)) return;
    const a = e.target.closest("a");
    if (a && dirty() && !window.confirm("放弃未保存的修改？")) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  window.addEventListener("beforeunload", unload);
  document.addEventListener("click", click, true);
  return () => {
    window.removeEventListener("beforeunload", unload);
    document.removeEventListener("click", click, true);
  };
}
