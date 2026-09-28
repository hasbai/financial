-- The prototype was never launched. Remove its public demo access only.
DELETE FROM users WHERE uuid = '11111111-1111-4111-8111-111111111111';
UPDATE nodes SET enabled = 0 WHERE token = 'dev-node-token';
ALTER TABLE users ADD COLUMN auth0_sub TEXT;
CREATE UNIQUE INDEX idx_users_auth0_sub ON users(auth0_sub);
ALTER TABLE users ADD COLUMN subscription_token TEXT;
CREATE UNIQUE INDEX idx_users_subscription_token ON users(subscription_token);
ALTER TABLE nodes ADD COLUMN client_json TEXT NOT NULL DEFAULT '{}';
