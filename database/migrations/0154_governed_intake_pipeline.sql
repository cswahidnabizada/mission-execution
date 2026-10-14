-- ON Mission 16.8.0 — shared governed intake ledger.
-- The ledger coordinates provenance and intake state; it never owns canonical domain truth.
CREATE TABLE IF NOT EXISTS platform_governed_intake_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intake_id TEXT NOT NULL UNIQUE,
  intake_type TEXT NOT NULL CHECK(intake_type IN ('manual_entry','data_entry_import','market_package')),
  source_type TEXT NOT NULL CHECK(source_type IN ('manual','structured_file','market_package','integration','system')),
  source_name TEXT,
  source_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  tenant_scope TEXT,
  country_scope TEXT,
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED','SCANNING','PREVIEWED','BLOCKED','APPROVED','COMMITTING','PARTIAL','COMMITTED','FAILED','CANCELLED')),
  item_count INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  blocked_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  manifest_json TEXT NOT NULL DEFAULT '{}',
  summary_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_governed_intake_status ON platform_governed_intake_batches(status,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_governed_intake_scope ON platform_governed_intake_batches(country_scope,tenant_scope,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_governed_intake_source_hash ON platform_governed_intake_batches(source_hash,intake_type);
CREATE TABLE IF NOT EXISTS platform_governed_intake_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intake_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  item_type TEXT NOT NULL,
  source_ref TEXT,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PREVIEWED','BLOCKED','DUPLICATE','APPROVED','COMMITTING','COMMITTED','FAILED','SKIPPED')),
  target_entry_id TEXT,
  target_resource_type TEXT,
  target_resource_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(intake_id,item_key),
  FOREIGN KEY(intake_id) REFERENCES platform_governed_intake_batches(intake_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_governed_intake_items_status ON platform_governed_intake_items(intake_id,status,id);
CREATE INDEX IF NOT EXISTS idx_governed_intake_items_entry ON platform_governed_intake_items(target_entry_id);
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('platform_governed_intake_batches','manifest_json','INTERNAL','platform_data_entry','DE_PLATFORM_DATA_ENTRY',0,1,'DE-GDPR-1'),
('platform_governed_intake_batches','summary_json','INTERNAL','platform_data_entry','DE_PLATFORM_DATA_ENTRY',0,1,'DE-GDPR-1'),
('platform_governed_intake_items','details_json','INTERNAL','platform_data_entry','DE_PLATFORM_DATA_ENTRY',0,1,'DE-GDPR-1');
