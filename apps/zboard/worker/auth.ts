import { createRemoteJWKSet, jwtVerify } from "jose";
import { authClaims } from "@hasbai/auth/config";
export const ROLE_CLAIM = authClaims.roles;
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
    const roles = payload[ROLE_CLAIM];
    return {
      sub: payload.sub,
      admin: Array.isArray(roles) && roles.includes("superadmin"),
      email:
        typeof payload[EMAIL_CLAIM] === "string"
          ? (payload[EMAIL_CLAIM] as string)
          : payload.sub,
    };
  } catch {
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
