CREATE TABLE IF NOT EXISTS clash_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  template_yaml TEXT NOT NULL,
  override_yaml TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
