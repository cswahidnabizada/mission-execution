-- ON Mission 10.71.7 — Canonical mutation lease boundary.
-- This is concurrency metadata only; it never becomes domain truth.
CREATE TABLE IF NOT EXISTS platform_mutation_leases (
  scope_key TEXT PRIMARY KEY,
  lock_token TEXT NOT NULL,
  actor_type TEXT,
  actor_id TEXT,
  acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_platform_mutation_leases_expiry
  ON platform_mutation_leases(expires_at);
