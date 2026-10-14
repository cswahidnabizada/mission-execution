-- ON Mission 10.47.0 — Universal Control Plane Governance Contract
-- Orchestration metadata only. These tables do not replace any canonical domain authority.

CREATE TABLE IF NOT EXISTS platform_control_plane_resource_contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_type TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  label TEXT NOT NULL,
  authority_code TEXT NOT NULL,
  governance_version TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(resource_type,resource_key)
);
CREATE INDEX IF NOT EXISTS idx_cp_resource_contracts_type ON platform_control_plane_resource_contracts(resource_type,updated_at DESC);

CREATE TABLE IF NOT EXISTS platform_control_plane_dependencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_type TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  dependency_type TEXT NOT NULL,
  dependency_key TEXT NOT NULL,
  relation TEXT NOT NULL CHECK(relation IN ('depends_on','used_by','blocks','affects','enables','verified_by')),
  impact_json TEXT NOT NULL DEFAULT '{}',
  rollback_json TEXT NOT NULL DEFAULT '{}',
  source_type TEXT NOT NULL DEFAULT 'canonical',
  source_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(resource_type,resource_key,dependency_type,dependency_key,relation)
);
CREATE INDEX IF NOT EXISTS idx_cp_dependencies_resource ON platform_control_plane_dependencies(resource_type,resource_key,relation);
CREATE INDEX IF NOT EXISTS idx_cp_dependencies_dependency ON platform_control_plane_dependencies(dependency_type,dependency_key,relation);

CREATE TABLE IF NOT EXISTS platform_control_plane_readiness (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_type TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('READY','BLOCKED','AUTHORITY_UNAVAILABLE','UNKNOWN')),
  score INTEGER NOT NULL DEFAULT 0 CHECK(score BETWEEN 0 AND 100),
  blockers_json TEXT NOT NULL DEFAULT '[]',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  verification_json TEXT NOT NULL DEFAULT '{}',
  evaluated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(resource_type,resource_key)
);
CREATE INDEX IF NOT EXISTS idx_cp_readiness_status ON platform_control_plane_readiness(status,updated_at DESC);

CREATE TABLE IF NOT EXISTS platform_control_plane_error_contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_type TEXT NOT NULL,
  error_code TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'ERROR',
  retryable INTEGER NOT NULL DEFAULT 0 CHECK(retryable IN (0,1)),
  next_action TEXT,
  authority_code TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(resource_type,error_code)
);
CREATE INDEX IF NOT EXISTS idx_cp_error_contracts_resource ON platform_control_plane_error_contracts(resource_type,error_code);

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('platform_control_plane_resource_contracts','metadata_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_control_plane_dependencies','impact_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_control_plane_dependencies','rollback_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_control_plane_readiness','blockers_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_control_plane_readiness','warnings_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_control_plane_readiness','verification_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_control_plane_error_contracts','description','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');
