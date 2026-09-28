export type Node = {
  id: number;
  name: string;
  node_type: string;
  enabled: number | boolean;
  user_count: number;
  config_template_id: number | null;
  config_revision: number;
  users_revision: number;
  client_json: string;
};
export type User = {
  id: number;
  email: string;
  auth0_sub: string;
  enabled: number;
  speed_limit: number;
  device_limit: number;
  expired_at: number | null;
  transfer_enable: number;
  upload: number;
  download: number;
  uuid?: string;
};
export type Template = {
  id: number;
  name: string;
  protocol: string;
  description: string;
  template_json: string;
};
export type Report = {
  id: number;
  node_id: number;
  event: string;
  payload_json: string;
  created_at: number;
};
export type Me = {
  admin: boolean;
  user: User;
  nodes: Pick<Node, "id" | "name" | "node_type">[];
  subscription_url: string | null;
};
export type Api = {
  request: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
};
export function bytes(n: number) {
  if (!n) return "0 B";
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), 4);
  return `${(n / 1024 ** i).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} ${["B", "KB", "MB", "GB", "TB"][i]}`;
}
export function expiry(n: number | null) {
  return n ? new Date(n * 1000).toLocaleDateString("zh-CN") : "长期有效";
}
export function status(user: User) {
  return !user.enabled
    ? "待启用"
    : user.expired_at && user.expired_at * 1000 <= Date.now()
      ? "已到期"
      : user.transfer_enable > 0 &&
          user.upload + user.download >= user.transfer_enable
        ? "额度用尽"
        : "使用中";
}
