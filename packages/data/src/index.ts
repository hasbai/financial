import {
  NeonPostgrestClient,
  fetchWithToken,
} from "@neondatabase/postgrest-js";
export const dataApiUrl =
  "https://ep-long-dew-b3q1him6.apirest.c-4.ap-southeast-1.aws.neon.tech/neondb/rest/v1";
export function createDataClient(
  url: string,
  schema: string,
  token?: () => Promise<string>,
) {
  return new NeonPostgrestClient({
    dataApiUrl: url,
    options: {
      db: { schema },
      ...(token ? { global: { fetch: fetchWithToken(token) } } : {}),
    },
  });
}
