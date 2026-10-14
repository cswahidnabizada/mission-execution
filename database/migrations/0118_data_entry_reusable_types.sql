-- ON Mission 10.64.0 — Universal Data Entry Ledger Contract
-- The original governed Data Entry ledger predated the universal reusable-data
-- wave and its CHECK constraint only allowed the original technical entry types.
-- Rebuild the ledger so every governed reusable Data Entry type is a first-class
-- ledger entry while preserving all existing rows, IDs, provenance and indexes.
CREATE TABLE platform_data_entry_records_new (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 entry_id TEXT NOT NULL UNIQUE,
 entry_type TEXT NOT NULL CHECK(entry_type IN (
  'product_component','product_definition','country_blueprint','country_product_launch','expansion_case','platform_configuration_draft',
  'product_country','sector','language','currency','region','classification','policy','consent','residency','retention',
  'role','capability','responsibility','storage','provider','component','page','feature','configuration','guidance','plan','eligibility','pricing'
 )),
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
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 commit_recovery_status TEXT NOT NULL DEFAULT 'none',
 commit_attempt INTEGER NOT NULL DEFAULT 0
);
INSERT INTO platform_data_entry_records_new SELECT
 id,entry_id,entry_type,source_type,source_id,actor_type,actor_id,tenant_scope,country_scope,payload_json,schema_version,classification,purpose,
 provenance_json,validation_json,policy_json,dependency_json,impact_json,risk_level,status,canonical_resource_type,canonical_resource_id,canonical_status,
 idempotency_key,commit_started_at,committed_at,rejection_code,rejection_message,created_at,updated_at,commit_recovery_status,commit_attempt
FROM platform_data_entry_records;
DROP TABLE platform_data_entry_records;
ALTER TABLE platform_data_entry_records_new RENAME TO platform_data_entry_records;
CREATE INDEX IF NOT EXISTS idx_platform_data_entry_status ON platform_data_entry_records(status,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_platform_data_entry_type ON platform_data_entry_records(entry_type,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_platform_data_entry_canonical ON platform_data_entry_records(canonical_resource_type,canonical_resource_id,status);
CREATE INDEX IF NOT EXISTS idx_platform_data_entry_scope ON platform_data_entry_records(country_scope,tenant_scope,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_data_entry_commit_recovery ON platform_data_entry_records(status,commit_started_at,commit_recovery_status);
