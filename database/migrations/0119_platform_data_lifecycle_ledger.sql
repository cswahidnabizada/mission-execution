-- ON Mission 10.68.0 — Canonical Data Lifecycle Evidence Ledger.
-- This is an event/evidence ledger only. It does not become a second source of truth.
CREATE TABLE IF NOT EXISTS platform_data_lifecycle_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 event_id TEXT NOT NULL UNIQUE,
 resource_type TEXT NOT NULL,
 resource_id TEXT NOT NULL,
 previous_stage TEXT,
 stage TEXT NOT NULL CHECK(stage IN ('DRAFT','VALIDATED','COMMITTED','ACTIVE','RESTRICTED','QUARANTINED','RESTORED','PURGED','RETAINED','BLOCKED')),
 action TEXT NOT NULL,
 reason_code TEXT NOT NULL,
 reason TEXT NOT NULL DEFAULT '',
 source_entry_id TEXT,
 canonical_authority TEXT,
 dependency_snapshot_json TEXT NOT NULL DEFAULT '{}',
 legal_hold INTEGER NOT NULL DEFAULT 0 CHECK(legal_hold IN (0,1)),
 actor_type TEXT NOT NULL,
 actor_id TEXT,
 request_id TEXT,
 metadata_json TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_data_lifecycle_resource ON platform_data_lifecycle_events(resource_type,resource_id,id DESC);
CREATE INDEX IF NOT EXISTS idx_data_lifecycle_stage ON platform_data_lifecycle_events(stage,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_data_lifecycle_entry ON platform_data_lifecycle_events(source_entry_id,created_at DESC,id DESC);
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('platform_data_lifecycle_events','reason','INTERNAL','platform_lifecycle','DE_PLATFORM_LIFECYCLE',0,1,'DE-GDPR-1'),
('platform_data_lifecycle_events','dependency_snapshot_json','INTERNAL','platform_lifecycle','DE_PLATFORM_LIFECYCLE',0,1,'DE-GDPR-1'),
('platform_data_lifecycle_events','metadata_json','INTERNAL','platform_lifecycle','DE_PLATFORM_LIFECYCLE',0,1,'DE-GDPR-1');
