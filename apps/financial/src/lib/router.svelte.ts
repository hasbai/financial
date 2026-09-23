import { safeReturnPath } from "./finance";

// A small History API router keeps the existing SPA URLs and query strings.
export function createRouter() {
  let location = $state({
    pathname: window.location.pathname,
    search: window.location.search,
  });
  let canLeave: () => boolean = () => true;
  let index = Number(window.history.state?.financialIndex ?? 0);
  let reverting = false;
  const read = () => {
    location = {
      pathname: window.location.pathname,
      search: window.location.search,
    };
  };
  function start() {
    window.history.replaceState(
      { ...window.history.state, financialIndex: index },
      "",
    );
    const pop = () => {
      if (reverting) {
        reverting = false;
        return;
      }
      const next = Number(window.history.state?.financialIndex ?? 0);
      if (!canLeave()) {
        reverting = true;
        window.history.go(index - next);
        return;
      }
      index = next;
      read();
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }
  function navigate(path: string, replace = false, bypass = false) {
    if (!bypass && !canLeave()) return;
    const url = new URL(safeReturnPath(path), window.location.origin);
    if (!replace) index++;
    window.history[replace ? "replaceState" : "pushState"](
      { financialIndex: index },
      "",
      url.pathname + url.search + url.hash,
    );
    read();
  }
  function intercept(event: MouseEvent) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const anchor = (event.target as Element).closest("a");
    if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href);
    if (url.origin !== window.location.origin || url.hash) return;
    event.preventDefault();
    navigate(url.pathname + url.search);
  }
  return {
    get location() {
      return location;
    },
    start,
    navigate,
    intercept,
    confirmLeave: () => canLeave(),
    guard(fn: () => boolean) {
      canLeave = fn;
      return () => {
        canLeave = () => true;
      };
    },
  };
}
export const router = createRouter();
