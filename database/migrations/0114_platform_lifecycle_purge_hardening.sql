-- ON Mission 10.59.0 — Platform Data Lifecycle, Trash & Recovery Completion.
-- Relaxes the old resource CHECK so the canonical lifecycle authority can govern
-- administrative UI/content/data-entry records without creating a second trash system.

ALTER TABLE platform_trash_items RENAME TO platform_trash_items_legacy_1058;
CREATE TABLE platform_trash_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 trash_key TEXT NOT NULL UNIQUE,
 resource_type TEXT NOT NULL,
 resource_id TEXT NOT NULL,
 display_name TEXT NOT NULL,
 reason_code TEXT NOT NULL CHECK(reason_code IN ('sample_data','unused_reference','abandoned_draft','failed_attempt','pre_live_product','manual_cleanup','user_requested','retention_expiry')),
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
INSERT INTO platform_trash_items (id,trash_key,resource_type,resource_id,display_name,reason_code,confidence,source_status,source_active,snapshot_json,dependency_snapshot_json,created_by_type,created_by_id,trashed_at,updated_at,purged_at,restored_at,legal_hold)
SELECT id,trash_key,resource_type,resource_id,display_name,reason_code,confidence,source_status,source_active,snapshot_json,dependency_snapshot_json,created_by_type,created_by_id,trashed_at,updated_at,purged_at,restored_at,legal_hold FROM platform_trash_items_legacy_1058;
DROP TABLE platform_trash_items_legacy_1058;
CREATE INDEX IF NOT EXISTS idx_platform_trash_state ON platform_trash_items(resource_type,legal_hold,purged_at,trashed_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_platform_trash_resource ON platform_trash_items(resource_type,resource_id,purged_at,id DESC);
INSERT OR IGNORE INTO processing_purposes(code,label,description,default_legal_basis,data_minimization_rule)
VALUES('platform_lifecycle','Platform data lifecycle','Governed quarantine, restoration, retention review and permanent disposition of administrative platform records.','legitimate_interests','Retain only the minimum lifecycle evidence required to establish authority, dependency checks, legal hold and disposition.');
INSERT OR IGNORE INTO retention_policies(code,purpose_code,jurisdiction_code,sector_code,retention_days,action_after_expiry,legal_hold_allowed,version)
VALUES('DE_PLATFORM_LIFECYCLE','platform_lifecycle','DE-GDPR-1','general',365,'review',1,'1');
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('platform_trash_items','snapshot_json','INTERNAL','platform_lifecycle','DE_PLATFORM_LIFECYCLE',0,1,'DE-GDPR-1'),
('platform_trash_items','dependency_snapshot_json','INTERNAL','platform_lifecycle','DE_PLATFORM_LIFECYCLE',0,1,'DE-GDPR-1');
