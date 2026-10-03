-- Keep old message rows. The permanent generation fence is set only when a session is imported.
ALTER TABLE sessions ADD COLUMN storage_backend TEXT NOT NULL DEFAULT 'd1';
ALTER TABLE sessions ADD COLUMN deleted_at INTEGER;
