-- 0165: durable idempotency and reconciliation ledger for canonical owner lifecycle commands.
CREATE TABLE IF NOT EXISTS platform_owner_lifecycle_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idempotency_key TEXT NOT NULL UNIQUE,
  operation_hash TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  command TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK(status IN ('IN_PROGRESS','COMPLETED','FAILED','RECOVERY_REQUIRED')),
  result_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_message TEXT,
  actor_type TEXT,
  actor_id TEXT,
  request_id TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_owner_lifecycle_operations_resource
  ON platform_owner_lifecycle_operations(resource_type, resource_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_owner_lifecycle_operations_status
  ON platform_owner_lifecycle_operations(status, updated_at);

-- The operation ledger contains actor references, command fingerprints and canonical read-back payloads.
-- Reuse the existing platform lifecycle purpose and German retention policy.
INSERT OR IGNORE INTO data_classification_registry
(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('platform_owner_lifecycle_operations','idempotency_key','SECURITY_SENSITIVE','platform_lifecycle','DE_PLATFORM_LIFECYCLE',0,1,'DE-GDPR-1'),
('platform_owner_lifecycle_operations','operation_hash','SECURITY_SENSITIVE','platform_lifecycle','DE_PLATFORM_LIFECYCLE',0,1,'DE-GDPR-1'),
('platform_owner_lifecycle_operations','resource_type','INTERNAL','platform_lifecycle','DE_PLATFORM_LIFECYCLE',0,1,'DE-GDPR-1'),
('platform_owner_lifecycle_operations','resource_id','INTERNAL','platform_lifecycle','DE_PLATFORM_LIFECYCLE',0,1,'DE-GDPR-1'),
('platform_owner_lifecycle_operations','result_json','CONFIDENTIAL','platform_lifecycle','DE_PLATFORM_LIFECYCLE',0,1,'DE-GDPR-1'),
('platform_owner_lifecycle_operations','actor_id','PERSONAL','platform_lifecycle','DE_PLATFORM_LIFECYCLE',0,1,'DE-GDPR-1'),
('platform_owner_lifecycle_operations','request_id','SECURITY_SENSITIVE','platform_lifecycle','DE_PLATFORM_LIFECYCLE',0,1,'DE-GDPR-1'),
('platform_owner_lifecycle_operations','error_message','INTERNAL','platform_lifecycle','DE_PLATFORM_LIFECYCLE',0,1,'DE-GDPR-1');
