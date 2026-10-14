-- ON Mission 10.38.26 — Platform Trash & Safe Cleanup
-- Trash is a reversible quarantine layer. Permanent deletion is a separate, step-up protected operation.
INSERT OR IGNORE INTO processing_purposes(code,label,description,default_legal_basis,data_minimization_rule)
VALUES('platform_cleanup','Platform cleanup','Quarantine, restore and permanently dispose of unused, draft, sample and abandoned platform records through governed administrative cleanup.','legitimate_interests','Store only cleanup metadata and snapshots necessary for reversible disposal and audit.');
INSERT OR IGNORE INTO retention_policies(code,purpose_code,jurisdiction_code,sector_code,retention_days,action_after_expiry,legal_hold_allowed,version)
VALUES('DE_PLATFORM_TRASH','platform_cleanup','DE-GDPR-1','general',90,'review',1,'1');
CREATE TABLE IF NOT EXISTS platform_trash_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 trash_key TEXT NOT NULL UNIQUE,
 resource_type TEXT NOT NULL CHECK(resource_type IN ('country','country_blueprint','country_sector','product_definition','country_product_launch','expansion_case')),
 resource_id TEXT NOT NULL,
 display_name TEXT NOT NULL,
 reason_code TEXT NOT NULL CHECK(reason_code IN ('sample_data','unused_reference','abandoned_draft','failed_attempt','pre_live_product','manual_cleanup')),
 confidence TEXT NOT NULL DEFAULT 'review' CHECK(confidence IN ('high','medium','review')),
 source_status TEXT,
 source_active INTEGER,
 snapshot_json TEXT NOT NULL DEFAULT '{}',
 dependency_snapshot_json TEXT NOT NULL DEFAULT '{}',
 created_by_type TEXT NOT NULL,
 created_by_id TEXT,
 trashed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 purged_at TEXT,
 restored_at TEXT,
 legal_hold INTEGER NOT NULL DEFAULT 0 CHECK(legal_hold IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_platform_trash_state ON platform_trash_items(resource_type,legal_hold,purged_at,trashed_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_platform_trash_resource ON platform_trash_items(resource_type,resource_id,purged_at,id DESC);
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('platform_trash_items','snapshot_json','INTERNAL','platform_cleanup','DE_PLATFORM_TRASH',0,1,'DE-GDPR-1'),
('platform_trash_items','dependency_snapshot_json','INTERNAL','platform_cleanup','DE_PLATFORM_TRASH',0,1,'DE-GDPR-1');
