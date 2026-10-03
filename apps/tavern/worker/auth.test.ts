import { it, expect, vi, afterEach } from "vitest";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { identity, ROLE_CLAIM } from "./auth";
afterEach(() => vi.unstubAllGlobals());
it("verifies signature, issuer, audience, expiry and grants admin only from the signed claim", async () => {
  const keys = await generateKeyPair("RS256");
  const jwk = await exportJWK(keys.publicKey);
  jwk.kid = "test";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ keys: [jwk] })),
  );
  const env = {
    AUTH0_DOMAIN: "hasbai.eu.auth0.com",
    AUTH0_AUDIENCE: "https://tavern.hasbai.xyz/api",
  } as const;
  const sign = (
    aud = env.AUTH0_AUDIENCE as string,
    exp = "1h",
    issuer = "https://hasbai.eu.auth0.com/",
  ) =>
    new SignJWT({ [ROLE_CLAIM]: "superadmin" })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setSubject("auth0|test")
      .setIssuer(issuer)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(keys.privateKey);
  const req = (token: string) =>
    new Request("https://tavern.test/api/me", {
      headers: { Authorization: "Bearer " + token },
    });
  expect((await identity(req(await sign()), env)).admin).toBe(true);
  for (const token of [
    await sign("https://financial.hasbai.xyz/api"),
    await sign(env.AUTH0_AUDIENCE, "-1h"),
    await sign(env.AUTH0_AUDIENCE, "1h", "https://wrong.test/"),
    "invalid",
  ])
    await expect(identity(req(token), env)).rejects.toMatchObject({
      status: 401,
    });
  const noRole = await new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'test'}).setSubject('auth0|ordinary').setIssuer('https://hasbai.eu.auth0.com/').setAudience(env.AUTH0_AUDIENCE).setIssuedAt().setExpirationTime('1h').sign(keys.privateKey);
  await expect(identity(req(noRole),env)).rejects.toMatchObject({status:403});
  await expect(
    identity(new Request("https://tavern.test/api/me"), env),
  ).rejects.toMatchObject({ status: 401 });
});
