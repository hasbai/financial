import {
  NeonPostgrestClient,
  fetchWithToken,
} from "@neondatabase/postgrest-js";

import { config } from "./config";
import type {
  Account,
  Transaction,
  Payload,
  Filters,
  Cursor,
  Page,
  Overview,
} from "./types";
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function errorMessage(e: unknown) {
  const message = e instanceof Error ? e.message : "请求失败，请重试";
  if (message.includes("CONFLICT"))
    return "这笔记录已在其他设备更新。你的输入已保留，请查看最新版本后重新编辑。";
  if (message.includes("IDEMPOTENCY_CONFLICT"))
    return "同一请求的内容发生变化，请刷新后核对是否已保存。";
  if (message.includes("FORBIDDEN") || message.includes("permission denied"))
    return "当前账号没有该账本的操作权限。";
  if (/login_required|consent_required|Missing Refresh Token/.test(message))
    return "登录已过期，请先保存输入或复制内容，再重新登录。";
  return message.replace(/^VALIDATION: /, "");
}
export function createRepository(getToken: () => Promise<string>) {
  const db = new NeonPostgrestClient({
    dataApiUrl: config.dataApiUrl,
    options: {
      db: { schema: config.schema },
      global: { fetch: fetchWithToken(getToken) },
    },
  });
  async function rpc<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const { data, error } = await db.rpc(name, args);
    if (error) throw new ApiError(error.code, error.message);
    return data as T;
  }
  return {
    async accounts() {
      const { data, error } = await db
        .from("account")
        .select("*")
        .order("type")
        .order("subtype")
        .order("name")
        .limit(1000);
      if (error) throw new ApiError(error.code, error.message);
      return data as Account[];
    },
    list: (filters: Filters, cursor: Cursor) =>
      rpc<Page>("transactions_page", {
        p_filters: filters,
        p_cursor: cursor,
        p_limit: 30,
      }),
    transaction: (id: number) =>
      rpc<Transaction | null>("transaction_detail", { p_id: id }),
    overview: (start: string, end: string, asOf: string) =>
      rpc<Overview>("overview", {
        p_start: start,
        p_end: end,
        p_as_of: asOf,
      }),
    save: (id: number | null, updatedAt: string | null, payload: Payload) =>
      rpc<Transaction>("save_transaction", {
        p_id: id,
        p_updated_at: updatedAt,
        p_payload: payload,
      }),
    saveAccount: (id: number | null, payload: Partial<Account>) =>
      rpc<Account>("save_account", { p_id: id, p_payload: payload }),
  };
}
export type Repository = ReturnType<typeof createRepository>;
