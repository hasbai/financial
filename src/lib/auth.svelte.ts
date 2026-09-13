import type { Auth0Client, User } from "@auth0/auth0-spa-js";
import { config } from "./config";
import { safeReturnPath } from "./finance";
import { router } from "./router.svelte";
import { errorMessage } from "./api";

export function createAuth() {
  let loading = $state(true);
  let user = $state<User | undefined>();
  let error = $state("");
  let client: Auth0Client;
  return {
    get loading() {
      return loading;
    },
    get user() {
      return user;
    },
    get error() {
      return error;
    },
    async init(clearCache: () => void) {
      try {
        const { Auth0Client } = await import("@auth0/auth0-spa-js");
        client = new Auth0Client({
          domain: config.domain,
          clientId: config.clientId,
          cacheLocation: "memory",
          authorizationParams: {
            redirect_uri: window.location.origin + "/auth/callback",
            audience: config.audience,
            scope: "openid profile email",
            connection: "eastmoney-email",
          },
        });
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
          await client.checkSession();
          if (window.location.pathname === "/auth/callback")
            router.navigate("/", true, true);
        }
        user = await client.getUser();
        if (!user) clearCache();
      } catch (e) {
        error = errorMessage(e);
        clearCache();
      } finally {
        loading = false;
      }
    },
    async login() {
      loading = true;
      error = "";
      try {
        await client.loginWithRedirect({
          appState: {
            returnTo: safeReturnPath(
              router.location.pathname + router.location.search,
            ),
          },
        });
      } catch (e) {
        error = errorMessage(e);
        loading = false;
      }
    },
    async logout(clearCache: () => void) {
      if (!router.confirmLeave()) return;
      clearCache();
      user = undefined;
      try {
        await client.logout({
          logoutParams: { returnTo: window.location.origin },
        });
      } catch (e) {
        error = errorMessage(e);
      }
    },
    async getToken() {
      const token = await client.getTokenSilently();
      if (!token) throw new Error("login_required");
      return token;
    },
  };
}
