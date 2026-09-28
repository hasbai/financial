import type { Api } from "./types";
export function createApi(getToken: () => Promise<string>): Api {
  return {
    async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
      const token = await getToken();
      const response = await fetch(`/api${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "请求失败");
      return data as T;
    },
  };
}
