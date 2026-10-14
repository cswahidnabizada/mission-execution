-- ON Mission 10.38.27 — Platform Data Control, Tenant/User Governance & Bulk Cleanup

-- Extend the existing governed Trash resource vocabulary without weakening its controls.
ALTER TABLE platform_trash_items RENAME TO platform_trash_items_legacy_1027;
CREATE TABLE platform_trash_items (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 trash_key TEXT NOT NULL UNIQUE,
 resource_type TEXT NOT NULL CHECK(resource_type IN ('tenant','user','country','country_blueprint','country_sector','product_definition','country_product_launch','expansion_case')),
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
INSERT INTO platform_trash_items SELECT * FROM platform_trash_items_legacy_1027;
DROP TABLE platform_trash_items_legacy_1027;
CREATE INDEX IF NOT EXISTS idx_platform_trash_state ON platform_trash_items(resource_type,legal_hold,purged_at,trashed_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_platform_trash_resource ON platform_trash_items(resource_type,resource_id,purged_at,id DESC);
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('platform_trash_items','snapshot_json','INTERNAL','platform_cleanup','DE_PLATFORM_TRASH',0,1,'DE-GDPR-1'),
('platform_trash_items','dependency_snapshot_json','INTERNAL','platform_cleanup','DE_PLATFORM_TRASH',0,1,'DE-GDPR-1');
INSERT OR IGNORE INTO processing_purposes(code,label,description,default_legal_basis,data_minimization_rule)
VALUES('platform_data_control','Platform data control','Governed search, warning, restriction, quarantine and controlled editing of platform records.','legitimate_interests','Store only action metadata and evidence necessary for administrative control and audit.');
INSERT OR IGNORE INTO retention_policies(code,purpose_code,jurisdiction_code,sector_code,retention_days,action_after_expiry,legal_hold_allowed,version)
VALUES('DE_PLATFORM_DATA_CONTROL','platform_data_control','DE-GDPR-1','general',365,'review',1,'1');
CREATE TABLE IF NOT EXISTS platform_admin_data_actions (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 resource_type TEXT NOT NULL CHECK(resource_type IN ('tenant','user','country','sector','ui','content','product_definition','expansion_case')),
 resource_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('warn','stop','trash','restore','purge','edit')),
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','completed','blocked','cancelled')),
 reason_code TEXT NOT NULL,
 reason TEXT NOT NULL DEFAULT '',
 payload_json TEXT NOT NULL DEFAULT '{}',
 target_company_id INTEGER,
 actor_type TEXT NOT NULL,
 actor_id TEXT,
 request_id TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at TEXT,
 UNIQUE(resource_type,resource_id,action,request_id)
);
CREATE INDEX IF NOT EXISTS idx_platform_data_actions_resource ON platform_admin_data_actions(resource_type,resource_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_data_actions_status ON platform_admin_data_actions(status,action,created_at DESC);
CREATE TABLE IF NOT EXISTS platform_admin_bulk_operations (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 operation_key TEXT NOT NULL UNIQUE,
 resource_type TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('warn','stop','trash','purge')),
 filter_json TEXT NOT NULL DEFAULT '{}',
 status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','running','completed','partial','blocked','cancelled')),
 matched_count INTEGER NOT NULL DEFAULT 0,
 processed_count INTEGER NOT NULL DEFAULT 0,
 success_count INTEGER NOT NULL DEFAULT 0,
 blocked_count INTEGER NOT NULL DEFAULT 0,
 failed_count INTEGER NOT NULL DEFAULT 0,
 cursor_id TEXT,
 actor_type TEXT NOT NULL,
 actor_id TEXT,
 request_id TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_platform_bulk_ops_status ON platform_admin_bulk_operations(status,updated_at DESC,id DESC);
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('platform_admin_data_actions','reason','INTERNAL','platform_data_control','DE_PLATFORM_DATA_CONTROL',0,1,'DE-GDPR-1'),
('platform_admin_data_actions','payload_json','INTERNAL','platform_data_control','DE_PLATFORM_DATA_CONTROL',0,1,'DE-GDPR-1'),
('platform_admin_bulk_operations','filter_json','INTERNAL','platform_data_control','DE_PLATFORM_DATA_CONTROL',0,1,'DE-GDPR-1');
