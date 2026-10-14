-- ON Mission 10.38.29 — Governed Data Entry Gate
-- Entry is staged and governed before canonical creation. No arbitrary CRUD authority is introduced.
CREATE TABLE IF NOT EXISTS platform_data_entry_records (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 entry_id TEXT NOT NULL UNIQUE,
 entry_type TEXT NOT NULL CHECK(entry_type IN ('product_component','product_definition','country_blueprint','country_product_launch','expansion_case','platform_configuration_draft')),
 source_type TEXT NOT NULL CHECK(source_type IN ('super_admin','tenant','user','system','import','integration','external_source')),
 source_id TEXT,
 actor_type TEXT NOT NULL,
 actor_id TEXT,
 tenant_scope TEXT,
 country_scope TEXT,
 payload_json TEXT NOT NULL DEFAULT '{}',
 schema_version TEXT NOT NULL,
 classification TEXT NOT NULL CHECK(classification IN ('CANONICAL','REFERENCE','CONFIGURATION','OPERATIONAL','USER_GENERATED','IMPORTED','SAMPLE','TEST','DRAFT','SENSITIVE')),
 purpose TEXT NOT NULL CHECK(purpose IN ('production','configuration','testing','migration','import','development','demonstration','temporary')),
 provenance_json TEXT NOT NULL DEFAULT '{}',
 validation_json TEXT NOT NULL DEFAULT '{}',
 policy_json TEXT NOT NULL DEFAULT '{}',
 dependency_json TEXT NOT NULL DEFAULT '{}',
 impact_json TEXT NOT NULL DEFAULT '{}',
 risk_level TEXT NOT NULL CHECK(risk_level IN ('low','medium','high','critical')),
 status TEXT NOT NULL DEFAULT 'preview' CHECK(status IN ('preview','validated','committed','rejected','cancelled')),
 canonical_resource_type TEXT,
 canonical_resource_id TEXT,
 canonical_status TEXT,
 idempotency_key TEXT UNIQUE,
 commit_started_at TEXT,
 committed_at TEXT,
 rejection_code TEXT,
 rejection_message TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_platform_data_entry_status ON platform_data_entry_records(status,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_platform_data_entry_type ON platform_data_entry_records(entry_type,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_platform_data_entry_canonical ON platform_data_entry_records(canonical_resource_type,canonical_resource_id,status);
CREATE INDEX IF NOT EXISTS idx_platform_data_entry_scope ON platform_data_entry_records(country_scope,tenant_scope,created_at DESC);
INSERT OR IGNORE INTO processing_purposes(code,label,description,default_legal_basis,data_minimization_rule)
VALUES('platform_data_entry','Platform data entry','Standardize, validate, classify and record provenance for information before canonical creation.','legitimate_interests','Store only entry payload, provenance, validation, dependency, policy and lifecycle evidence necessary for governed creation.');
INSERT OR IGNORE INTO retention_policies(code,purpose_code,jurisdiction_code,sector_code,retention_days,action_after_expiry,legal_hold_allowed,version)
VALUES('DE_PLATFORM_DATA_ENTRY','platform_data_entry','DE-GDPR-1','general',365,'review',1,'1');
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('platform_data_entry_records','payload_json','INTERNAL','platform_data_entry','DE_PLATFORM_DATA_ENTRY',0,1,'DE-GDPR-1'),
('platform_data_entry_records','provenance_json','INTERNAL','platform_data_entry','DE_PLATFORM_DATA_ENTRY',0,1,'DE-GDPR-1'),
('platform_data_entry_records','validation_json','INTERNAL','platform_data_entry','DE_PLATFORM_DATA_ENTRY',0,1,'DE-GDPR-1'),
('platform_data_entry_records','policy_json','INTERNAL','platform_data_entry','DE_PLATFORM_DATA_ENTRY',0,1,'DE-GDPR-1'),
('platform_data_entry_records','dependency_json','INTERNAL','platform_data_entry','DE_PLATFORM_DATA_ENTRY',0,1,'DE-GDPR-1'),
('platform_data_entry_records','impact_json','INTERNAL','platform_data_entry','DE_PLATFORM_DATA_ENTRY',0,1,'DE-GDPR-1');
