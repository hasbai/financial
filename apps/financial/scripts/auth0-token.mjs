import { createHash, randomBytes } from "node:crypto";
import { loadEnvFile } from "node:process";
import { CookieJar, JSDOM } from "jsdom";
import { fileURLToPath } from "node:url";

// Local integration testing only. Never imported by the SPA. This uses the
// ordinary Universal Login form and Authorization Code + PKCE; it never uses
// a password grant, Auth0 CLI, management API, or tenant configuration.
const DOMAIN = "hasbai.eu.auth0.com";
const ORIGIN = `https://${DOMAIN}`;
const CLIENT_ID = "mdmD7xvX5yay52SRVZeuIOhGHIa0Wdl2";
const AUDIENCE = "https://financial.hasbai.xyz/api";
const ISSUER = `${ORIGIN}/`;
const CALLBACK_URL =
  process.env.AUTH0_TEST_REDIRECT_URI || "http://localhost:5173/auth/callback";
const EXPECTED_SUB = "auth0|6a9e921870e37d7bbfb76c8f";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_STEPS = 12;

class Auth0LoginError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "Auth0LoginError";
  }
}

function credentials() {
  try {
    loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const email = process.env.AUTH0_TEST_EMAIL;
  const password = process.env.AUTH0_TEST_PASSWORD;
  if (!email || !password)
    throw new Auth0LoginError(
      "AUTH0_TEST_EMAIL and AUTH0_TEST_PASSWORD are required in the local .env",
    );
  return {
    email,
    password,
    realm: process.env.AUTH0_TEST_REALM || "eastmoney-email",
  };
}

function ensureAuthUrl(url) {
  if (url.protocol !== "https:" || url.origin !== ORIGIN)
    throw new Auth0LoginError(
      "Auth0 returned an unexpected origin; login stopped.",
    );
}

function isCallback(url) {
  const callback = new URL(CALLBACK_URL);
  return url.origin === callback.origin && url.pathname === callback.pathname;
}

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function challenge(html, url) {
  const path = new URL(url).pathname.toLowerCase();
  if (/\/(?:mfa|mfa-|otp|multifactor|challenge)/.test(path)) return "MFA";
  if (
    /<(?:input|iframe|div|section)[^>]+(?:captcha|recaptcha|hcaptcha)/i.test(
      html,
    ) ||
    /(?:verify you are human|complete the captcha|请完成验证码|安全验证)/i.test(
      visibleText(html),
    )
  )
    return "CAPTCHA or identity-protection verification";
  if (
    /(?:\bmfa\b|\botp\b|one[- ]time passcode|verification code|authenticator app|多因素认证|一次性验证码|验证代码|身份验证器)/i.test(
      visibleText(html),
    )
  )
    return "MFA";
  return null;
}

function checkPage(response, html, url, stage) {
  const required = challenge(html, url);
  if (required)
    throw new Auth0LoginError(
      `Auth0 ${stage} requires ${required}; refusing to bypass MFA, CAPTCHA, or identity protection.`,
    );
  if (response.status === 403 || response.status === 429)
    throw new Auth0LoginError(
      `Auth0 ${stage} was refused with HTTP ${response.status}; refusing to bypass identity protection or rate limiting.`,
    );
}

function primaryForm(html, url) {
  const dom = new JSDOM(html);
  const forms = [...dom.window.document.forms];
  const form =
    forms.find((item) => item.dataset.formPrimary === "true") || forms[0];
  if (!form) return null;
  const fields = new URLSearchParams();
  for (const input of form.querySelectorAll("input")) {
    if (
      !input.name ||
      ["submit", "button", "file", "image"].includes(input.type)
    )
      continue;
    if (["checkbox", "radio"].includes(input.type) && !input.checked) continue;
    fields.set(input.name, input.value);
  }
  const button =
    form.querySelector('button[data-action-button-primary="true"]') ||
    form.querySelector("button[name]");
  if (button?.name) fields.set(button.name, button.value || "");
  return {
    action: new URL(form.getAttribute("action") || url, url).href,
    fields,
    has(name) {
      return Boolean(form.querySelector(`input[name="${name}"]`));
    },
  };
}

async function request(url, init, jar) {
  ensureAuthUrl(new URL(url));
  const headers = new Headers(init.headers || {});
  const cookie = jar.getCookieStringSync(url);
  if (cookie) headers.set("cookie", cookie);
  let response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: "manual",
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Auth0LoginError(
      error?.name === "TimeoutError"
        ? `Auth0 request timed out after ${REQUEST_TIMEOUT_MS} ms.`
        : "Auth0 network request failed.",
      { cause: error },
    );
  }
  for (const cookie of response.headers.getSetCookie())
    jar.setCookieSync(cookie, url);
  return response;
}

async function pageOrCallback(url, init, jar, stage) {
  let current = new URL(url);
  let options = { ...init };
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const response = await request(current.href, options, jar);
    const location = response.headers.get("location");
    if (location && response.status >= 300 && response.status < 400) {
      const next = new URL(location, current);
      if (isCallback(next)) return { callback: next };
      ensureAuthUrl(next);
      current = next;
      options = {
        method: "GET",
        headers: { accept: "text/html,application/xhtml+xml" },
      };
      continue;
    }
    const html = await response.text();
    checkPage(response, html, current.href, stage);
    return { html, url: current.href };
  }
  throw new Auth0LoginError("Auth0 login exceeded the redirect limit.");
}

function submit(form, values) {
  const body = new URLSearchParams(form.fields);
  for (const [name, value] of Object.entries(values)) body.set(name, value);
  if (!body.has("action")) body.set("action", "default");
  return {
    method: "POST",
    headers: {
      accept: "text/html,application/xhtml+xml",
      "content-type": "application/x-www-form-urlencoded",
      origin: ORIGIN,
      referer: form.action,
    },
    body,
  };
}

function failed(stage, result) {
  const text = visibleText(result.html || "");
  if (
    /too many|blocked|suspicious|unusual activity|try again later|temporarily/i.test(
      text,
    )
  )
    throw new Auth0LoginError(
      `Auth0 ${stage} was blocked by identity protection or rate limiting; refusing to bypass it.`,
    );
  throw new Auth0LoginError(
    `Auth0 ${stage} did not complete; the normal login form rejected the credentials or returned an unexpected response.`,
  );
}

function jwtPart(token, index) {
  try {
    return JSON.parse(
      Buffer.from(token.split(".")[index], "base64url").toString(),
    );
  } catch {
    throw new Auth0LoginError("Auth0 returned a malformed JWT access token.");
  }
}

function validate(token) {
  if (typeof token !== "string" || token.split(".").length !== 3)
    throw new Auth0LoginError(
      "Auth0 returned a non-JWT access token; expected the financial API audience.",
    );
  const header = jwtPart(token, 0);
  const claims = jwtPart(token, 1);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    header.alg !== "RS256" ||
    claims.sub !== EXPECTED_SUB ||
    !audiences.includes(AUDIENCE) ||
    claims.iss !== ISSUER ||
    !Number.isFinite(claims.exp) ||
    claims.exp <= Date.now() / 1000
  )
    throw new Auth0LoginError(
      "Auth0 access token claims do not match the financial API owner configuration.",
    );
  return { header, claims };
}

async function exchange(code, verifier) {
  let response;
  try {
    response = await fetch(`${ORIGIN}/oauth/token`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        code,
        code_verifier: verifier,
        redirect_uri: CALLBACK_URL,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Auth0LoginError("Auth0 authorization-code exchange failed.", {
      cause: error,
    });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token)
    throw new Auth0LoginError(
      `Auth0 authorization-code exchange returned HTTP ${response.status}.`,
    );
  return data;
}

export async function getUserToken() {
  const { email, password, realm } = credentials();
  const jar = new CookieJar();
  const state = randomBytes(20).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const authorize = new URL(`${ORIGIN}/authorize`);
  authorize.search = new URLSearchParams({
    client_id: CLIENT_ID,
    audience: AUDIENCE,
    response_type: "code",
    scope: "openid profile email",
    redirect_uri: CALLBACK_URL,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state,
    nonce: randomBytes(20).toString("hex"),
    prompt: "login",
    connection: realm,
  });
  try {
    const identifier = await pageOrCallback(
      authorize.href,
      { method: "GET", headers: { accept: "text/html,application/xhtml+xml" } },
      jar,
      "identifier page",
    );
    if (identifier.callback)
      throw new Auth0LoginError(
        "Auth0 did not present the normal identifier form; login stopped.",
      );
    const identifierForm = primaryForm(identifier.html, identifier.url);
    if (!identifierForm?.has("username"))
      return failed("identifier step", identifier);
    const passwordPage = await pageOrCallback(
      identifierForm.action,
      submit(identifierForm, { username: email }),
      jar,
      "identifier step",
    );
    if (passwordPage.callback)
      throw new Auth0LoginError(
        "Auth0 skipped credential entry; login stopped.",
      );
    const passwordForm = primaryForm(passwordPage.html, passwordPage.url);
    if (!passwordForm?.has("password"))
      return failed("identifier step", passwordPage);
    const completed = await pageOrCallback(
      passwordForm.action,
      submit(passwordForm, { username: email, password }),
      jar,
      "password step",
    );
    if (!completed.callback) return failed("password step", completed);
    const code = completed.callback.searchParams.get("code");
    if (!code || completed.callback.searchParams.get("state") !== state)
      throw new Auth0LoginError(
        "Auth0 callback state or authorization code was invalid.",
      );
    const tokenData = await exchange(code, verifier);
    const tokenClaims = validate(tokenData.access_token);
    return { accessToken: tokenData.access_token, tokenData, tokenClaims };
  } finally {
    jar.removeAllCookiesSync();
  }
}

export async function withUserToken(run) {
  const { accessToken, tokenData } = await getUserToken();
  return run(accessToken, tokenData);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    await getUserToken();
    console.log(
      "Auth0 normal Authorization Code + PKCE login succeeded; validated sub/audience/issuer. The access token remained in memory and Auth0 configuration was not modified.",
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Auth0 login failed.",
    );
    process.exitCode = 1;
  }
}
