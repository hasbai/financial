import { it, expect, vi, afterEach } from "vitest";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { identity, EMAIL_CLAIM, ROLE_CLAIM } from "./auth";
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
    AUTH0_DOMAIN: "auth.hasbai.xyz",
    AUTH0_AUDIENCE: "https://zboard.hasbai.xyz/api",
  } as const;
  const sign = (
    aud = env.AUTH0_AUDIENCE as string,
    exp = "1h",
    issuer = "https://auth.hasbai.xyz/",
    role: unknown = ["member", "superadmin"],
  ) =>
    new SignJWT({ [ROLE_CLAIM]: role, [EMAIL_CLAIM]: "owner@example.test" })
      .setProtectedHeader({ alg: "RS256", kid: "test" })
      .setSubject("auth0|test")
      .setIssuer(issuer)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime(exp)
      .sign(keys.privateKey);
  const req = (token: string) =>
    new Request("https://zboard.test/api/me", {
      headers: { Authorization: "Bearer " + token },
    });
  expect(ROLE_CLAIM).toBe("_roles"); expect(EMAIL_CLAIM).toBe("email");
  const verified = await identity(req(await sign()), env);
  expect(verified.admin).toBe(true);
  expect(verified.email).toBe("owner@example.test");
  for (const token of [
    await sign("https://financial.hasbai.xyz/api"),
    await sign(env.AUTH0_AUDIENCE, "-1h"),
    await sign(env.AUTH0_AUDIENCE, "1h", "https://wrong.test/"),
    await sign(env.AUTH0_AUDIENCE, "1h", "https://hasbai.eu.auth0.com/"),
    "invalid",
  ])
    await expect(identity(req(token), env)).rejects.toMatchObject({
      status: 401,
    });
  for (const role of [[], ["member"], "superadmin", null, {superadmin: true}]) {
    const request = req(await sign(env.AUTH0_AUDIENCE, "1h", "https://auth.hasbai.xyz/", role));
    expect((await identity(request, env)).admin).toBe(false);
  }
  await expect(
    identity(new Request("https://zboard.test/api/me"), env),
  ).rejects.toMatchObject({ status: 401 });
});
