-- ON Mission 11.15.0 — Canonical Provider Integration Layer
-- Provider capabilities are configuration contracts. They never become mission truth or authorization authorities.

CREATE TABLE IF NOT EXISTS external_provider_capabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_code TEXT NOT NULL,
  capability_code TEXT NOT NULL,
  action_code TEXT NOT NULL,
  adapter_type TEXT NOT NULL CHECK(adapter_type IN ('http_json','in_app')),
  execute_path TEXT,
  execute_method TEXT NOT NULL DEFAULT 'POST' CHECK(execute_method IN ('POST','PUT','PATCH','DELETE')),
  verify_path TEXT,
  verify_method TEXT NOT NULL DEFAULT 'GET' CHECK(verify_method IN ('GET','POST')),
  credential_binding TEXT,
  authorization_header TEXT NOT NULL DEFAULT 'Authorization',
  authorization_prefix TEXT NOT NULL DEFAULT 'Bearer',
  request_fields_json TEXT NOT NULL DEFAULT '[]',
  verification_required INTEGER NOT NULL DEFAULT 1 CHECK(verification_required IN (0,1)),
  verification_success_values_json TEXT NOT NULL DEFAULT '[true,"VERIFIED","SUCCEEDED","SUCCESS"]',
  timeout_ms INTEGER NOT NULL DEFAULT 10000 CHECK(timeout_ms BETWEEN 1000 AND 30000),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  version TEXT NOT NULL DEFAULT '1',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider_code,capability_code,version),
  UNIQUE(provider_code,action_code,version),
  FOREIGN KEY(provider_code) REFERENCES external_provider_registry(code)
);

CREATE INDEX IF NOT EXISTS idx_external_provider_capabilities_action
ON external_provider_capabilities(action_code,active,version DESC);
CREATE INDEX IF NOT EXISTS idx_external_provider_capabilities_provider
ON external_provider_capabilities(provider_code,active,version DESC);

CREATE TABLE IF NOT EXISTS external_provider_execution_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  provider_code TEXT NOT NULL,
  capability_code TEXT NOT NULL,
  company_id INTEGER,
  mission_id INTEGER,
  attempt_id TEXT,
  action_code TEXT NOT NULL,
  operation_id TEXT,
  phase TEXT NOT NULL CHECK(phase IN ('DISPATCH','VERIFY')),
  status TEXT NOT NULL CHECK(status IN ('STARTED','SUCCEEDED','FAILED','UNKNOWN','VERIFIED','UNVERIFIED')),
  http_status INTEGER,
  request_hash TEXT,
  response_summary_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(provider_code) REFERENCES external_provider_registry(code),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_external_provider_execution_scope
ON external_provider_execution_events(company_id,mission_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_provider_execution_attempt
ON external_provider_execution_events(attempt_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_provider_execution_provider
ON external_provider_execution_events(provider_code,created_at DESC);

CREATE TRIGGER external_provider_execution_events_no_delete
BEFORE DELETE ON external_provider_execution_events
BEGIN
  SELECT RAISE(ABORT, 'EXTERNAL_PROVIDER_EXECUTION_EVENT_DELETE_FORBIDDEN');
END;

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('external_provider_capabilities','credential_binding','SECURITY_SENSITIVE','mission_execution','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1'),
('external_provider_capabilities','request_fields_json','CONFIDENTIAL','mission_execution','DE_MISSION_DEFAULT',0,1,'DE-GDPR-1'),
('external_provider_execution_events','request_hash','SECURITY_SENSITIVE','mission_execution','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1'),
('external_provider_execution_events','response_summary_json','CONFIDENTIAL','mission_execution','DE_MISSION_DEFAULT',0,1,'DE-GDPR-1');
