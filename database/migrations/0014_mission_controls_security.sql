-- V7.2.7 mission-control hardening.
CREATE TABLE IF NOT EXISTS request_idempotency (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_key TEXT NOT NULL,
  action_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  resource_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_request_idempotency_unique
ON request_idempotency(scope_key,action_key,idempotency_key);

CREATE INDEX IF NOT EXISTS idx_request_idempotency_expiry
ON request_idempotency(expires_at);
