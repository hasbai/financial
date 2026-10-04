-- A recoverable state seed accompanies the existing atomic D1 branch source.
-- Live state and tool steps remain in the session's private DO SQLite.
ALTER TABLE sessions ADD COLUMN agent_seed_json TEXT;
