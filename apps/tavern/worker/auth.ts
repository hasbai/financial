import { createRemoteJWKSet, jwtVerify } from "jose";
import { authClaims, hasPermission, permissions } from "@hasbai/auth/config";
export const ROLE_CLAIM = authClaims.roles;
export const USERNAME_CLAIM = authClaims.username;
export const EMAIL_CLAIM = authClaims.email;
const keys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function identity(
  request: Request,
  env: Pick<Env, "AUTH0_DOMAIN" | "AUTH0_AUDIENCE">,
) {
  const token = request.headers
    .get("Authorization")
    ?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) throw new AuthError(401, "请先登录");
  const issuer = `https://${env.AUTH0_DOMAIN}/`;
  let jwks = keys.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(".well-known/jwks.json", issuer));
    keys.set(issuer, jwks);
  }
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience: env.AUTH0_AUDIENCE,
      algorithms: ["RS256"],
      requiredClaims: ["sub", "exp", "iat"],
    });
    if (!payload.sub || payload.sub.endsWith("@clients"))
      throw new Error("Not a user");
    const admin = hasPermission(payload, permissions.tavern);
    return {
      sub: payload.sub,
      admin,
      username: profileName(payload[USERNAME_CLAIM], payload.sub),
      email:
        typeof payload[EMAIL_CLAIM] === "string"
          ? (payload[EMAIL_CLAIM] as string)
          : payload.sub,
    };
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError(401, "登录已失效，请重新登录");
  }
}
export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Only Auth0 profile values are eligible; RP persona names and subject IDs are not. */
function profileName(value: unknown, sub: string): string | undefined {
  if (typeof value !== "string") return;
  const name = value.trim();
  if (!name || name === sub || name.length > 256 || /[\u0000-\u001f\u007f]/u.test(name)) return;
  return name;
}

/** Generation requires the verified JWT profile claim; no per-turn identity API calls. */
export function authenticatedUsername(user: Awaited<ReturnType<typeof identity>>): string {
  const username = profileName(user.username, user.sub);
  if (!username) throw new AuthError(401, "账户名称未更新，请重新登录后重试");
  return username;
}
