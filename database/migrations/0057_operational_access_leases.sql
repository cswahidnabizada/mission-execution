-- ON Mission 10.31.88 — Authoritative Operational Access Lease
-- KV remains a short-lived projection/cache. D1 owns the atomic action counter.
CREATE TABLE IF NOT EXISTS operational_access_leases (
  token_hash TEXT PRIMARY KEY,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  action_count INTEGER NOT NULL DEFAULT 0 CHECK (action_count >= 0 AND action_count <= 10)
);
CREATE INDEX IF NOT EXISTS idx_operational_access_leases_expiry
ON operational_access_leases(expires_at);
