import { env } from "$env/dynamic/public";
import { dataApiUrl } from "@hasbai/data";
import { repository } from "./api";
export const anonymousAuthUrl =
  "https://ep-long-dew-b3q1him6.neonauth.c-4.ap-southeast-1.aws.neon.tech/neondb/auth";
/** A short-lived, public guest JWT; no session, secret, or backend proxy. */
export function publicRepository() {
  let pending: Promise<string> | undefined;
  const token = () =>
    (pending ??= fetch(
      `${env.PUBLIC_ANONYMOUS_AUTH_URL || anonymousAuthUrl}/token/anonymous`,
      { credentials: "omit" },
    )
      .catch((cause) => {
        if (
          (env.PUBLIC_ANONYMOUS_AUTH_URL || "").startsWith(
            "http://127.0.0.1:",
          ) &&
          cause instanceof Error
        )
          console.error(
            "Blog fixture anonymous token fetch failed",
            cause.cause,
          );
        throw cause;
      })
      .then(async (response) => {
        if (!response.ok) throw new Error("匿名访问暂时不可用");
        const body = (await response.json()) as { token?: string };
        if (!body.token) throw new Error("匿名访问暂时不可用");
        return body.token;
      }));
  return repository(token, env.PUBLIC_DATA_API_URL || dataApiUrl);
}
