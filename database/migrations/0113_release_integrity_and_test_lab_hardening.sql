-- ON Mission 10.52.1 — Release Integrity & Test Lab Hardening.
-- Adds immutable Product Contract snapshots, dependency hashes, exact verification state,
-- and normalized Test Lab scenario integrity fields.
ALTER TABLE platform_product_release_lifecycles ADD COLUMN contract_snapshot_json TEXT;
ALTER TABLE platform_product_release_lifecycles ADD COLUMN dependency_snapshot_hash TEXT;

ALTER TABLE platform_product_test_scenarios ADD COLUMN contract_hash TEXT;
ALTER TABLE platform_product_test_scenarios ADD COLUMN dependency_snapshot_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_product_release_contract_hash ON platform_product_release_lifecycles(contract_hash);
CREATE INDEX IF NOT EXISTS idx_product_test_scenario_contract_hash ON platform_product_test_scenarios(contract_hash);

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('platform_product_release_lifecycles','contract_snapshot_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_product_release_lifecycles','dependency_snapshot_hash','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_product_test_scenarios','contract_hash','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_product_test_scenarios','dependency_snapshot_hash','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');

CREATE TABLE IF NOT EXISTS platform_product_release_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_key TEXT NOT NULL UNIQUE,
  launch_id INTEGER NOT NULL,
  operation_type TEXT NOT NULL CHECK(operation_type IN ('publish','verify','rollback')),
  status TEXT NOT NULL DEFAULT 'precheck' CHECK(status IN ('precheck','preparing','publishing','verifying','committed','failed','reconciliation_required')),
  actor_type TEXT,
  actor_id TEXT,
  request_id TEXT,
  error_code TEXT,
  error_message TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_product_release_operations_launch ON platform_product_release_operations(launch_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_release_operations_status ON platform_product_release_operations(status,updated_at DESC);
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES('platform_product_release_operations','metadata_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');
