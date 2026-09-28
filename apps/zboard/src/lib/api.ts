import type { Api } from "./types";
export function createApi(getToken: () => Promise<string | undefined>): Api {
  return {
    async request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
      const token = await getToken();
      if (!token) throw new Error("登录已失效，请重新登录");
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
      if (!response.ok) {
        const message =
          data &&
          typeof data === "object" &&
          "message" in data &&
          typeof data.message === "string"
            ? data.message
            : "请求失败";
        throw new Error(message);
      }
      return data as T;
    },
  };
}
