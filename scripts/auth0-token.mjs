import { execFileSync } from "node:child_process";
import { loadEnvFile } from "node:process";
// Local integration testing only. Never imported into the SPA.
export async function withUserToken(run) {
  loadEnvFile(".env");
  const domain = "hasbai.eu.auth0.com";
  const client = "mdmD7xvX5yay52SRVZeuIOhGHIa0Wdl2";
  const cli = (args) =>
    JSON.parse(
      execFileSync("auth0", args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  const original = cli([
    "api",
    "get",
    `clients/${client}?fields=grant_types&include_fields=true`,
  ]).grant_types;
  const required = [
    "password",
    "http://auth0.com/oauth/grant-type/password-realm",
  ];
  const modified = required.some((x) => !original.includes(x));
  try {
    if (modified)
      cli([
        "api",
        "patch",
        `clients/${client}`,
        "--data",
        JSON.stringify({
          grant_types: [...new Set([...original, ...required])],
        }),
      ]);
    const response = await fetch(`https://${domain}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "http://auth0.com/oauth/grant-type/password-realm",
        realm: process.env.AUTH0_TEST_REALM || "eastmoney-email",
        client_id: client,
        username: process.env.AUTH0_TEST_EMAIL,
        password: process.env.AUTH0_TEST_PASSWORD,
        audience: "https://financial.hasbai.xyz/api",
        scope: "openid profile email",
      }),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        `Auth0 ${response.status}: ${data.error}: ${data.error_description}`,
      );
    await run(data.access_token, data);
  } finally {
    if (modified)
      cli([
        "api",
        "patch",
        `clients/${client}`,
        "--data",
        JSON.stringify({ grant_types: original }),
      ]);
  }
}
