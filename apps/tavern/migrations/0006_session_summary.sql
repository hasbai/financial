-- Old Workers ignore this nullable checkpoint; original messages and IDs stay intact.
ALTER TABLE sessions ADD COLUMN summary_json TEXT;
