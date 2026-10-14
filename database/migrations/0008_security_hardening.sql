-- V7.1 security hardening.
-- Atomic D1-backed rate limiting for authentication and verification endpoints.

CREATE TABLE IF NOT EXISTS security_rate_limits (
  rate_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0,
  window_expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_security_rate_limits_expiry
ON security_rate_limits(window_expires_at);
