PRAGMA foreign_keys = ON;
CREATE TABLE characters (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL,
 creator TEXT NOT NULL, tags_json TEXT NOT NULL, card_json TEXT NOT NULL, format TEXT NOT NULL,
 source TEXT NOT NULL DEFAULT '', source_url TEXT NOT NULL DEFAULT '', source_id TEXT NOT NULL DEFAULT '',
 original_key TEXT NOT NULL, original_filename TEXT NOT NULL, avatar_key TEXT, avatar_type TEXT,
 content_hash TEXT NOT NULL, created_at INTEGER NOT NULL,
 UNIQUE(owner, content_hash)
);
CREATE INDEX characters_owner ON characters(owner, created_at DESC);
CREATE TABLE worldbooks (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, book_json TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), created_at INTEGER NOT NULL
);
CREATE INDEX worldbooks_owner ON worldbooks(owner, created_at DESC);
CREATE TABLE sessions (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, title TEXT NOT NULL, character_json TEXT NOT NULL,
 character_name TEXT NOT NULL, settings_json TEXT NOT NULL, book_ids_json TEXT NOT NULL DEFAULT '[]',
 generation_id TEXT, generation_until INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX sessions_owner ON sessions(owner, updated_at DESC);
CREATE TABLE messages (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL CHECK(status IN ('pending','completed','aborted','error')), ordinal INTEGER NOT NULL,
 request_id TEXT, created_at INTEGER NOT NULL,
 UNIQUE(session_id, request_id, role)
);
CREATE INDEX messages_session ON messages(session_id, ordinal, created_at);
CREATE TABLE settings (owner TEXT PRIMARY KEY, settings_json TEXT NOT NULL);
