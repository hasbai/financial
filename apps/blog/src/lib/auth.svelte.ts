import { createBrowserClient, type Auth0Client, type User } from "@hasbai/auth";
export function createAuth() {
  let client: Auth0Client;
  let user = $state<User>();
  let loading = $state(true);
  let error = $state("");
  const safe = (path: unknown) =>
    typeof path === "string" &&
    /^\/studio(?:\/|$)/.test(path) &&
    !path.includes("\\")
      ? path
      : "/studio";
  return {
    get user() {
      return user;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    async init() {
      try {
        client = createBrowserClient(location.origin);
        if (location.pathname === "/auth/callback") {
          const result = await client.handleRedirectCallback<{
            returnTo?: string;
          }>();
          location.replace(safe(result.appState?.returnTo));
          return;
        }
        await client.checkSession({ timeoutInSeconds: 3 });
        user = await client.getUser();
      } catch (e) {
        const code = (e as { error?: string }).error;
        if (
          ![
            "login_required",
            "consent_required",
            "interaction_required",
            "timeout",
          ].includes(code ?? "")
        )
          error = e instanceof Error ? e.message : "登录失败";
      } finally {
        loading = false;
      }
    },
    async login() {
      error = "";
      try {
        await client.loginWithRedirect({
          appState: { returnTo: safe(location.pathname) },
        });
      } catch {
        error = "登录失败，请重试";
      }
    },
    async logout() {
      await client.logout({ logoutParams: { returnTo: location.origin } });
    },
    async token() {
      const value = await client.getTokenSilently();
      if (!value) throw new Error("请重新登录");
      return value;
    },
  };
}
export type BlogAuth = ReturnType<typeof createAuth>;
