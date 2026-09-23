import { Auth0Client } from "@auth0/auth0-spa-js";
export const authConfig = {
  domain: "hasbai.eu.auth0.com",
  clientId: "mdmD7xvX5yay52SRVZeuIOhGHIa0Wdl2",
  audience: "https://financial.hasbai.xyz/api",
} as const;
/** Invoke only in the browser. Tokens stay in SDK memory. */
export function createBrowserClient(origin: string) {
  return new Auth0Client({
    domain: authConfig.domain,
    clientId: authConfig.clientId,
    cacheLocation: "memory",
    authorizeTimeoutInSeconds: 3,
    authorizationParams: {
      redirect_uri: `${origin}/auth/callback`,
      audience: authConfig.audience,
      scope: "openid profile email",
      connection: "eastmoney-email",
    },
  });
}
export type { Auth0Client, User } from "@auth0/auth0-spa-js";
