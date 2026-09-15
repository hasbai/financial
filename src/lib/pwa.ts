export function registerPwa() {
  if (!("serviceWorker" in navigator)) return;
  // No skipWaiting: a new release cannot replace code beneath an unsaved transaction.
  void navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .catch(() => {});
}
