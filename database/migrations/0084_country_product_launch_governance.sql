-- ON Mission 10.37.10 — Country Product Launch Governance
-- Ensure the classification dependency exists before the governed configuration record is inserted.
INSERT OR IGNORE INTO processing_purposes
(code,label,description,default_legal_basis,data_minimization_rule)
VALUES
('product_configuration','Product configuration','Govern and operate platform product configuration, country launch configuration, eligibility rules and controlled product activation.','legitimate_interests','Store only configuration data necessary to govern and operate the configured product.');

CREATE TABLE IF NOT EXISTS country_product_launches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','validated','active','retired')),
  manifest_json TEXT NOT NULL DEFAULT '{}',
  eligibility_json TEXT NOT NULL DEFAULT '{}',
  readiness_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  effective_at TEXT,
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(country_code,version),
  FOREIGN KEY(country_code) REFERENCES country_catalog(code)
);
CREATE INDEX IF NOT EXISTS idx_country_product_launch_active ON country_product_launches(country_code,status,active);
CREATE INDEX IF NOT EXISTS idx_country_product_launch_status ON country_product_launches(status,updated_at DESC);
CREATE TABLE IF NOT EXISTS country_product_launch_change_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  launch_id INTEGER NOT NULL,
  stage TEXT NOT NULL DEFAULT 'draft' CHECK(stage IN ('draft','validated','activated','retired','rejected')),
  requested_by_type TEXT NOT NULL,
  requested_by_id TEXT,
  impact_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_country_product_launch_changes ON country_product_launch_change_requests(launch_id,stage,created_at DESC);
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES('country_product_launches','manifest_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');
