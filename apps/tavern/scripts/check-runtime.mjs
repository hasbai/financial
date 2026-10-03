import { createHash, randomBytes } from "node:crypto";
import { loadEnvFile } from "node:process";
import { CookieJar, JSDOM } from "../../financial/node_modules/jsdom/lib/api.js";
import { fileURLToPath } from "node:url";

// Local integration testing only. Never imported by the SPA. This uses the
// ordinary Universal Login form and Authorization Code + PKCE; it never uses
// a password grant, Auth0 CLI, management API, or tenant configuration.
const DOMAIN = "hasbai.eu.auth0.com";
const ORIGIN = `https://${DOMAIN}`;
const CLIENT_ID = "mdmD7xvX5yay52SRVZeuIOhGHIa0Wdl2";
const AUDIENCE = "https://tavern.hasbai.xyz/api";
const ORGANIZATION_ID = "org_qR4E7HTZE1Zv10go";
const ISSUER = `${ORIGIN}/`;
const CALLBACK_URL =
  process.env.AUTH0_TEST_REDIRECT_URI || "http://localhost:5176/auth/callback";
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
    fields.append(input.name, input.value);
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
      "Auth0 returned a non-JWT access token; expected the Tavern API audience.",
    );
  const header = jwtPart(token, 0);
  const claims = jwtPart(token, 1);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    header.alg !== "RS256" ||
    claims.sub !== EXPECTED_SUB ||
    claims.org_id !== ORGANIZATION_ID ||
    !audiences.includes(AUDIENCE) ||
    claims.iss !== ISSUER ||
    !Number.isFinite(claims.exp) ||
    claims.exp <= Date.now() / 1000
  )
    throw new Auth0LoginError(
      "Auth0 access token claims do not match the Tavern API owner and organization configuration.",
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
    organization: ORGANIZATION_ID,
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
    let completed = await pageOrCallback(
      passwordForm.action,
      submit(passwordForm, { username: email, password }),
      jar,
      "password step",
    );
    if (!completed.callback && new URL(completed.url).pathname === '/u/consent') {
      const consentForm = primaryForm(completed.html, completed.url);
      const dom = new JSDOM(completed.html);
      const accept = [...dom.window.document.querySelectorAll('button[name="action"]')].find(b => /accept|接受|同意/i.test(b.textContent || ''));
      if (!consentForm || !accept?.value) return failed('consent step', completed);
      completed = await pageOrCallback(consentForm.action, submit(consentForm, { action: accept.value }), jar, 'consent step');
    }
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

const base=process.argv[2]||'https://tavern.hasbai.xyz';
await withUserToken(async(token)=>{
 const headers={Authorization:'Bearer '+token};
 const tail=await fetch(base+'/api/discover?q=&page=418',{headers});const tailData=await tail.json();if(!tail.ok||tailData.results?.length!==7||tailData.hasMore)throw new Error('Complete catalog last page failed');
 const tailInstall=await fetch(base+'/api/install',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({source:'theatrelm',id:tailData.results.at(-1).id})});if(!tailInstall.ok)throw new Error('Last catalog page install failed');console.log(JSON.stringify({stage:'catalog-tail',page:418,count:tailData.results.length,installed:true}));
 const response=await fetch(base+'/api/discover?q=Kaida',{headers});
 const data=await response.json();
 console.log(JSON.stringify({stage:'search',status:response.status,count:data.results?.length,first:data.results?.[0]?.name}));
 if(!response.ok||!data.results?.length)throw new Error('Real search failed');
 const installed=await fetch(base+'/api/install',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({source:'theatrelm',id:data.results[0].id})});
 const character=await installed.json();if(!installed.ok)throw new Error('Real install failed');
 const chat=await fetch(base+'/api/sessions',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({characterId:character.id})});
 const session=await chat.json();if(!chat.ok)throw new Error('Real session failed');
 console.log(JSON.stringify({stage:'install',character:character.name,session:session.id,status:chat.status}));
 const result=await fetch(base+'/api/sessions/'+session.id+'/generate',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),content:'A traveler enters the tavern. Respond with one short sentence in character.'}),signal:AbortSignal.timeout(180000)});
 const stream=await result.text();
 console.log(JSON.stringify({stage:'generation',status:result.status,hasDelta:stream.includes('"type":"delta"'),hasDone:stream.includes('"type":"done"'),hasError:stream.includes('"type":"error"'),bytes:stream.length}));
 const restored=await fetch(base+'/api/sessions/'+session.id,{headers});const saved=await restored.json();
 console.log(JSON.stringify({stage:'restored',messages:saved.messages?.map(m=>({role:m.role,status:m.status,chars:m.content.length}))}));
 if(!stream.includes('"type":"delta"')||stream.includes('"type":"error"'))throw new Error('Real gateway generation failed');
 const stopped=await fetch(base+'/api/sessions/'+session.id+'/generate',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({requestId:crypto.randomUUID(),content:'Continue the story.'}),signal:AbortSignal.timeout(45000)});
 if(!stopped.ok||!stopped.body)throw new Error('Stop generation request failed');const reader=stopped.body.getReader(),decoder=new TextDecoder();let frames='',generationId='';
 while(!generationId){const next=await reader.read();if(next.done)throw new Error('No start frame');frames+=decoder.decode(next.value,{stream:true});for(const line of frames.split('\n'))if(line.startsWith('data: ')){try{const event=JSON.parse(line.slice(6));if(event.type==='start')generationId=event.messageId;}catch{}}}
 const stop=await fetch(base+'/api/sessions/'+session.id+'/stop',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({generationId})});if(!stop.ok)throw new Error('Real stop failed');
 while(!(await reader.read()).done){}let recovery;for(let i=0;i<15;i++){recovery=await(await fetch(base+'/api/sessions/'+session.id,{headers})).json();if(!recovery.session?.generationId)break;await new Promise(resolve=>setTimeout(resolve,1000));}
 const last=recovery.messages?.find(m=>m.id===generationId);console.log(JSON.stringify({stage:'stop-recovery',status:last?.status,lockCleared:!recovery.session?.generationId}));if(last?.status!=='aborted'||recovery.session?.generationId)throw new Error('Stop recovery failed');
 const removed=await fetch(base+'/api/sessions/'+session.id,{method:'DELETE',headers});if(!removed.ok)throw new Error('Probe cleanup failed');

});
