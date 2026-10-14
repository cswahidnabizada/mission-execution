-- ON Mission 10.51.0 — governed Product Release Lifecycle orchestration record.
-- This does not replace country_product_launches truth; it records release authorization,
-- immutable dependency/contract snapshots, verification evidence and rollback metadata.
CREATE TABLE IF NOT EXISTS platform_product_release_lifecycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  launch_id INTEGER NOT NULL UNIQUE,
  previous_launch_id INTEGER,
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','validated','authorized','published','verified','live','retired')),
  contract_hash TEXT,
  dependency_snapshot_json TEXT NOT NULL DEFAULT '{}',
  verification_evidence_json TEXT NOT NULL DEFAULT '{}',
  rollback_path_json TEXT NOT NULL DEFAULT '{}',
  authorized_by_type TEXT,
  authorized_by_id TEXT,
  authorized_at TEXT,
  published_at TEXT,
  verified_at TEXT,
  live_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE CASCADE,
  FOREIGN KEY(previous_launch_id) REFERENCES country_product_launches(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_product_release_lifecycle_state ON platform_product_release_lifecycles(state,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_release_lifecycle_previous ON platform_product_release_lifecycles(previous_launch_id);
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES('platform_product_release_lifecycles','dependency_snapshot_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');
