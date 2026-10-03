-- Nullable metadata preserves all historic messages and old Worker compatibility.
ALTER TABLE messages ADD COLUMN candidates_json TEXT;
CREATE TABLE model_capabilities (
  id TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
