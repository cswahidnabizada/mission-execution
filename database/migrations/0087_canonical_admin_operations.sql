-- ON Mission 10.38.14 — Canonical Administrative Operations & Stability
-- Administrative operations are an execution record, not a replacement for domain Truth.
CREATE TABLE IF NOT EXISTS platform_admin_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_key TEXT NOT NULL UNIQUE,
  idempotency_key TEXT,
  action_code TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  scope_key TEXT,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  request_id TEXT,
  status TEXT NOT NULL DEFAULT 'preparing' CHECK(status IN ('preparing','executing','verifying','succeeded','failed','rolled_back','expired')),
  expected_version TEXT,
  preconditions_json TEXT NOT NULL DEFAULT '{}',
  impact_json TEXT NOT NULL DEFAULT '{}',
  result_json TEXT NOT NULL DEFAULT '{}',
  rollback_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_message TEXT,
  lease_expires_at TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_admin_operations_idempotency
ON platform_admin_operations(action_code,scope_key,idempotency_key)
WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_admin_operations_active_scope
ON platform_admin_operations(scope_key)
WHERE status IN ('preparing','executing','verifying');
CREATE INDEX IF NOT EXISTS idx_platform_admin_operations_status
ON platform_admin_operations(status,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_platform_admin_operations_resource
ON platform_admin_operations(resource_type,resource_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_platform_admin_operations_request
ON platform_admin_operations(request_id,created_at DESC,id DESC);
