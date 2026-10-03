// Authorized setup only. Preserves existing application origins and trigger bindings.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
function api(method, path, data) {
  let out;
  try { out = execFileSync(
    "auth0",
    ["api", method, path, ...(data ? ["--data", JSON.stringify(data)] : [])],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 },
  );
  } catch { throw new Error(`Auth0 API ${method} ${path} failed or timed out`); }
  return out.trim() ? JSON.parse(out) : {};
}
const audience = "https://tavern.hasbai.xyz/api",
  clientId = "mdmD7xvX5yay52SRVZeuIOhGHIa0Wdl2";
const resources = api("get", "resource-servers");
if (!resources.some((r) => r.identifier === audience))
  api("post", "resource-servers", {
    name: "Tavern API",
    identifier: audience,
    signing_alg: "RS256",
    token_lifetime: 3600,
    allow_offline_access: false,
  });
const client = api("get", `clients/${clientId}`);
const origins = [
  "https://tavern.hasbai.xyz",
  "https://tavern.hasbai.workers.dev",
  "http://localhost:5176",
  "http://127.0.0.1:5176",
];
api("patch", `clients/${clientId}`, {
  callbacks: [
    ...new Set([
      ...(client.callbacks ?? []),
      ...origins.map((o) => o + "/auth/callback"),
    ]),
  ],
  allowed_logout_urls: [
    ...new Set([...(client.allowed_logout_urls ?? []), ...origins]),
  ],
  web_origins: [...new Set([...(client.web_origins ?? []), ...origins])],
});
const listed = api("get", "actions/actions");
const existing = (listed.actions ?? listed).find(
  (a) => a.name === "tavern role",
);
const spec = {
  name: "tavern role",
  supported_triggers: [{ id: "post-login", version: "v3" }],
  runtime: "node22",
  code: readFileSync(
    new URL("../../../auth0/tavern-role.js", import.meta.url),
    "utf8",
  ),
};
const action = existing
  ? api("patch", `actions/actions/${existing.id}`, {
      code: spec.code,
      runtime: spec.runtime,
    })
  : api("post", "actions/actions", spec);
const id = action.id ?? existing.id;
api("post", `actions/actions/${id}/deploy`, {});
const before = api("get", "actions/triggers/post-login/bindings");
const bindings = (before.bindings ?? before).map((b) => ({
  ref: { type: "action_id", value: b.action.id },
  display_name: b.display_name,
}));
if (!bindings.some((b) => b.ref.value === id))
  bindings.push({
    ref: { type: "action_id", value: id },
    display_name: "tavern role",
  });
api("patch", "actions/triggers/post-login/bindings", { bindings });
const verified = api("get", `clients/${clientId}`);
const after = api("get", "actions/triggers/post-login/bindings");
if (
  !origins.every(
    (origin) =>
      verified.callbacks.includes(origin + "/auth/callback") &&
      verified.allowed_logout_urls.includes(origin) &&
      verified.web_origins.includes(origin),
  ) ||
  !(after.bindings ?? after).some((b) => b.action.id === id)
)
  throw new Error("Auth0 configuration verification failed");
console.log(
  JSON.stringify({
    audience,
    actionId: id,
    callbackConfigured: true,
    actionBound: true,
  }),
);
