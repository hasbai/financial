export function registerPwa() {
  if (!("serviceWorker" in navigator)) return;
  // Activation changes future requests, never reloads an open transaction form.
  void navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .then((registration) => {
      let checking = false;
      const update = async () => {
        if (
          checking ||
          document.visibilityState === "hidden" ||
          !navigator.onLine
        )
          return;
        checking = true;
        try {
          await registration.update();
        } catch {
          /* Retry on the next foreground/online event. */
        } finally {
          checking = false;
        }
      };
      window.addEventListener("pageshow", update);
      window.addEventListener("online", update);
      document.addEventListener("visibilitychange", update);
      void update();
    })
    .catch(() => {});
}
