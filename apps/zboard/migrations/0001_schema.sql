PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS config_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  protocol TEXT NOT NULL,
  template_json TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  node_type TEXT NOT NULL DEFAULT 'vless',
  enabled INTEGER NOT NULL DEFAULT 1,
  config_template_id INTEGER REFERENCES config_templates(id) ON DELETE SET NULL,
  config_json TEXT NOT NULL,
  config_revision INTEGER NOT NULL DEFAULT 1,
  users_revision INTEGER NOT NULL DEFAULT 1,
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_nodes_token ON nodes(token);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  uuid TEXT NOT NULL UNIQUE,
  speed_limit INTEGER NOT NULL DEFAULT 0,
  device_limit INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  expired_at INTEGER,
  transfer_enable INTEGER NOT NULL DEFAULT 0,
  upload INTEGER NOT NULL DEFAULT 0,
  download INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS node_users (
  node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (node_id, user_id)
);

CREATE TABLE IF NOT EXISTS node_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_node_reports_node_created ON node_reports(node_id, created_at DESC);
