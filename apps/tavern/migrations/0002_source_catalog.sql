-- Pinned public source releases. Switching the release is atomic after a full import.
CREATE TABLE source_catalog (
 source TEXT NOT NULL, revision TEXT NOT NULL, source_id TEXT NOT NULL,
 name TEXT NOT NULL, description TEXT NOT NULL, creator TEXT NOT NULL, tags_json TEXT NOT NULL,
 source_url TEXT NOT NULL, card_json TEXT NOT NULL,
 PRIMARY KEY(source,revision,source_id)
);
CREATE INDEX source_catalog_name ON source_catalog(source,revision,name);
CREATE TABLE source_releases (source TEXT PRIMARY KEY, revision TEXT NOT NULL, count INTEGER NOT NULL, imported_at INTEGER NOT NULL);
