import { beforeEach, expect, it, vi } from "vitest";
import { createAuth } from "./auth.svelte";
import { config } from "./config";
import { router } from "./router.svelte";
const sdk = vi.hoisted(() => ({
  constructor: vi.fn(),
  checkSession: vi.fn(),
  getUser: vi.fn(),
  handleRedirectCallback: vi.fn(),
  loginWithRedirect: vi.fn(),
  logout: vi.fn(),
  getTokenSilently: vi.fn(),
}));
vi.mock("@auth0/auth0-spa-js", () => ({
  Auth0Client: class {
    constructor(options: unknown) {
      sdk.constructor(options);
    }
    checkSession = sdk.checkSession;
    getUser = sdk.getUser;
    handleRedirectCallback = sdk.handleRedirectCallback;
    loginWithRedirect = sdk.loginWithRedirect;
    logout = sdk.logout;
    getTokenSilently = sdk.getTokenSilently;
  },
}));
beforeEach(() => {
  vi.resetAllMocks();
  router.navigate("/", true, true);
  sdk.getUser.mockResolvedValue({ sub: config.ownerSubject });
});
it("uses the existing audience, connection and memory-only token cache", async () => {
  const auth = createAuth();
  await auth.init(vi.fn());
  expect(sdk.constructor).toHaveBeenCalledWith(
    expect.objectContaining({
      cacheLocation: "memory",
      domain: config.domain,
      clientId: config.clientId,
      authorizationParams: expect.objectContaining({
        audience: config.audience,
        connection: "eastmoney-email",
      }),
    }),
  );
  expect(auth.user?.sub).toBe(config.ownerSubject);
  expect(auth.loading).toBe(false);
});
it("handles callback and returns to a safe filtered route", async () => {
  router.navigate("/auth/callback?code=mock&state=mock", true, true);
  // Callback is an SDK-owned route, unlike user return paths.
  window.history.replaceState({}, "", "/auth/callback?code=mock&state=mock");
  sdk.handleRedirectCallback.mockResolvedValue({
    appState: { returnTo: "/transactions?review=needed" },
  });
  const clear = vi.fn();
  const auth = createAuth();
  await auth.init(clear);
  expect(router.location).toEqual({
    pathname: "/transactions",
    search: "?review=needed",
  });
  expect(clear).toHaveBeenCalled();
});
it("rejects external callback destinations and never retains callback parameters", async () => {
  window.history.replaceState({}, "", "/auth/callback?code=mock&state=mock");
  sdk.handleRedirectCallback.mockResolvedValue({
    appState: { returnTo: "//outside.example" },
  });
  await createAuth().init(vi.fn());
  expect(window.location.pathname + window.location.search).toBe("/");
});
it("obtains a fresh access token for each request and clears cache on logout", async () => {
  const auth = createAuth();
  await auth.init(vi.fn());
  sdk.getTokenSilently.mockResolvedValue("token");
  await auth.getToken();
  await auth.getToken();
  expect(sdk.getTokenSilently).toHaveBeenCalledTimes(2);
  const clear = vi.fn();
  await auth.logout(clear);
  expect(clear).toHaveBeenCalled();
  expect(auth.user).toBeUndefined();
  expect(sdk.logout).toHaveBeenCalledWith({
    logoutParams: { returnTo: window.location.origin },
  });
});
it("reports callback errors and leaves the user signed out", async () => {
  window.history.replaceState(
    {},
    "",
    "/auth/callback?error=access_denied&state=mock",
  );
  sdk.handleRedirectCallback.mockRejectedValue(new Error("access_denied"));
  const auth = createAuth();
  const clear = vi.fn();
  await auth.init(clear);
  expect(auth.error).toBe("access_denied");
  expect(auth.loading).toBe(false);
  expect(auth.user).toBeUndefined();
  expect(clear).toHaveBeenCalled();
});
