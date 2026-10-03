-- Completion reasons survive refreshes; legacy rows have no reliable upstream reason.
ALTER TABLE messages ADD COLUMN finish_reason TEXT;
-- Raise the original 1024-token default, including snapshots already in use.
UPDATE settings SET settings_json=json_set(settings_json,'$.maxTokens',4096)
 WHERE json_extract(settings_json,'$.maxTokens')=1024;
UPDATE sessions SET settings_json=json_set(settings_json,'$.maxTokens',4096)
 WHERE json_extract(settings_json,'$.maxTokens')=1024;
