-- ON Mission 10.31.87 — Canonical Activation Review Requests
-- Reviewer asks the user to correct specific activation facts; the user remains
-- the only writer of their own identity/profile data. Requests are durable and
-- tenant/executor scoped.
CREATE TABLE IF NOT EXISTS activation_review_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_type TEXT NOT NULL CHECK (identity_type IN ('tenant','driver','executor')),
  identity_id INTEGER NOT NULL,
  tenant_id INTEGER,
  requested_fields TEXT NOT NULL,
  reviewer_message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','dismissed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_activation_review_identity
ON activation_review_requests(identity_type,identity_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activation_review_tenant
ON activation_review_requests(tenant_id,status,created_at DESC);
