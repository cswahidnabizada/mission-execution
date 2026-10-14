-- ON Mission 10.37.1 — Super Admin + Platform Control
-- Product configuration is versioned and governed. Secrets remain outside product configuration.

CREATE TABLE IF NOT EXISTS platform_configuration_change_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  configuration_version_id INTEGER NOT NULL,
  stage TEXT NOT NULL DEFAULT 'draft' CHECK(stage IN ('draft','validated','authorized','approved','activated','rejected','cancelled')),
  requested_by_type TEXT NOT NULL,
  requested_by_id TEXT,
  authorization_actor_type TEXT,
  authorization_actor_id TEXT,
  approved_by_type TEXT,
  approved_by_id TEXT,
  impact_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(configuration_version_id) REFERENCES platform_configuration_versions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_platform_config_change_stage ON platform_configuration_change_requests(stage,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_config_change_version ON platform_configuration_change_requests(configuration_version_id,created_at DESC);

CREATE TABLE IF NOT EXISTS platform_admin_security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  request_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_platform_admin_security_events_time ON platform_admin_security_events(created_at DESC,id DESC);

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('platform_configuration_change_requests','reason','CONFIDENTIAL','compliance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_configuration_change_requests','impact_json','INTERNAL','compliance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_admin_security_events','metadata','SECURITY_SENSITIVE','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1');
