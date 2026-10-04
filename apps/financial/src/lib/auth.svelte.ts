import { createBrowserClient, type Auth0Client, type User } from "@hasbai/auth";
import { permissions, tokenHasPermission } from "@hasbai/auth/config";
import { safeReturnPath } from "./finance";
import { router } from "./router.svelte";
import { errorMessage } from "./api";

export function createAuth() {
  let loading = $state(true);
  let authorized = $state(false);
  let user = $state<User | undefined>();
  let error = $state("");
  let client: Auth0Client;
  const attemptKey = "financial.loginAttempt";
  const logoutKey = "financial.loggedOut";
  async function redirect() {
    sessionStorage.removeItem(logoutKey);
    sessionStorage.setItem(attemptKey, "true");
    await client.loginWithRedirect({
      appState: {
        returnTo: safeReturnPath(
          router.location.pathname + router.location.search,
        ),
      },
    });
  }
  return {
    get loading() {
      return loading;
    },
    get authorized() {
      return authorized;
    },
    get user() {
      return user;
    },
    get error() {
      return error;
    },
    async init(clearCache: () => void) {
      let redirecting = false;
      try {
        client = createBrowserClient(window.location.origin);
        const params = new URLSearchParams(window.location.search);
        if (
          window.location.pathname === "/auth/callback" &&
          (params.has("code") || params.has("error"))
        ) {
          const result = await client.handleRedirectCallback<{
            returnTo?: string;
          }>();
          clearCache();
          router.navigate(
            safeReturnPath(result.appState?.returnTo),
            true,
            true,
          );
        } else {
          if (!sessionStorage.getItem(logoutKey)) {
            try {
              await client.checkSession({ timeoutInSeconds: 3 });
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
                throw e;
            }
          }
          if (window.location.pathname === "/auth/callback")
            router.navigate("/", true, true);
        }
        user = await client.getUser();
        if (user) {
          authorized = tokenHasPermission(await client.getTokenSilently(), permissions.financial);
          sessionStorage.removeItem(attemptKey);
          sessionStorage.removeItem(logoutKey);
        } else {
          clearCache();
          if (
            !sessionStorage.getItem(logoutKey) &&
            !sessionStorage.getItem(attemptKey)
          ) {
            await redirect();
            redirecting = true;
          }
        }
      } catch (e) {
        user = undefined;
        authorized = false;
        error = errorMessage(e);
        clearCache();
      } finally {
        loading = redirecting;
      }
    },
    async login() {
      loading = true;
      error = "";
      try {
        await redirect();
      } catch (e) {
        user = undefined;
        authorized = false;
        error = errorMessage(e);
        loading = false;
      }
    },
    async logout(clearCache: () => void) {
      if (!router.confirmLeave()) return;
      clearCache();
      user = undefined;
      authorized = false;
      sessionStorage.setItem(logoutKey, "true");
      sessionStorage.removeItem(attemptKey);
      try {
        await client.logout({
          logoutParams: { returnTo: window.location.origin },
        });
      } catch (e) {
        user = undefined;
        authorized = false;
        error = errorMessage(e);
      }
    },
    async getToken() {
      const token = await client.getTokenSilently();
      if (!token) throw new Error("login_required");
      authorized = tokenHasPermission(token, permissions.financial);
      if (!authorized) throw new Error("当前账号没有访问权限");
      return token;
    },
  };
}
