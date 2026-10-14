-- ON Mission 10.38.24 — Expansion Workspace
-- Expansion is an orchestration layer over canonical country, product, health, verification and launch authorities.
-- Expansion-specific compliance metadata must be seeded before the classification registry rows below.
-- These are referenced by foreign keys in data_classification_registry.
INSERT OR IGNORE INTO processing_purposes(code,label,description,default_legal_basis,data_minimization_rule)
VALUES('product_expansion','Product expansion','Plan, compose, verify and govern product expansion work across countries, sectors, languages, capabilities, workflows and variants.','legitimate_interests','Store only expansion planning, dependency, lineage and evidence metadata necessary to govern product composition and launch.');

INSERT OR IGNORE INTO retention_policies(code,purpose_code,jurisdiction_code,sector_code,retention_days,action_after_expiry,legal_hold_allowed,version)
VALUES('DE_PRODUCT_EXPANSION_REVIEW','product_expansion','DE-GDPR-1','general',1095,'review',1,'1');

CREATE TABLE IF NOT EXISTS platform_product_expansion_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expansion_key TEXT NOT NULL UNIQUE,
  source_definition_id INTEGER,
  source_launch_id INTEGER,
  target_country_code TEXT NOT NULL,
  target_sector_code TEXT NOT NULL DEFAULT 'general',
  expansion_type TEXT NOT NULL CHECK(expansion_type IN ('new_country','new_sector','new_language','capability','workflow','variant')),
  status TEXT NOT NULL DEFAULT 'planning' CHECK(status IN ('planning','preparing','composing','verifying','ready','launching','live','blocked','retired')),
  stage TEXT NOT NULL DEFAULT 'decision',
  owner_type TEXT,
  owner_id TEXT,
  source_snapshot_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(source_definition_id) REFERENCES platform_product_definitions(id) ON DELETE SET NULL,
  FOREIGN KEY(source_launch_id) REFERENCES country_product_launches(id) ON DELETE SET NULL,
  FOREIGN KEY(target_country_code) REFERENCES country_catalog(code)
);
CREATE INDEX IF NOT EXISTS idx_product_expansion_scope ON platform_product_expansion_cases(target_country_code,target_sector_code,status,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_product_expansion_source ON platform_product_expansion_cases(source_definition_id,source_launch_id,status,id DESC);

CREATE TABLE IF NOT EXISTS platform_product_expansion_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expansion_id INTEGER NOT NULL,
  task_key TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','ready','in_progress','blocked','completed','skipped','not_applicable')),
  required INTEGER NOT NULL DEFAULT 1,
  dependency_task_id INTEGER,
  authority TEXT NOT NULL DEFAULT 'expansion',
  action_code TEXT,
  target_route TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  completion_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(expansion_id,task_key),
  FOREIGN KEY(expansion_id) REFERENCES platform_product_expansion_cases(id) ON DELETE CASCADE,
  FOREIGN KEY(dependency_task_id) REFERENCES platform_product_expansion_tasks(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_product_expansion_tasks ON platform_product_expansion_tasks(expansion_id,status,required,id);

CREATE TABLE IF NOT EXISTS platform_product_expansion_deltas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expansion_id INTEGER NOT NULL,
  component_type TEXT NOT NULL,
  component_key TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK(change_type IN ('inherited','modified','added','removed','review')),
  source_ref TEXT,
  target_ref TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','accepted','rejected','applied')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(expansion_id,component_type,component_key),
  FOREIGN KEY(expansion_id) REFERENCES platform_product_expansion_cases(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_product_expansion_deltas ON platform_product_expansion_deltas(expansion_id,change_type,status,component_type,component_key);

CREATE TABLE IF NOT EXISTS platform_product_expansion_lineage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expansion_id INTEGER NOT NULL,
  parent_definition_id INTEGER,
  child_definition_id INTEGER,
  relation TEXT NOT NULL CHECK(relation IN ('inherits','overrides','adds','removes','creates')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(expansion_id,parent_definition_id,child_definition_id,relation),
  FOREIGN KEY(expansion_id) REFERENCES platform_product_expansion_cases(id) ON DELETE CASCADE,
  FOREIGN KEY(parent_definition_id) REFERENCES platform_product_definitions(id) ON DELETE SET NULL,
  FOREIGN KEY(child_definition_id) REFERENCES platform_product_definitions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_product_expansion_lineage_parent ON platform_product_expansion_lineage(parent_definition_id,relation,child_definition_id);
CREATE INDEX IF NOT EXISTS idx_product_expansion_lineage_child ON platform_product_expansion_lineage(child_definition_id,relation,parent_definition_id);

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('platform_product_expansion_cases','source_snapshot_json','INTERNAL','product_expansion','DE_PRODUCT_EXPANSION_REVIEW',0,1,'DE-GDPR-1'),
('platform_product_expansion_cases','metadata_json','INTERNAL','product_expansion','DE_PRODUCT_EXPANSION_REVIEW',0,1,'DE-GDPR-1'),
('platform_product_expansion_tasks','evidence_json','INTERNAL','product_expansion','DE_PRODUCT_EXPANSION_REVIEW',0,1,'DE-GDPR-1'),
('platform_product_expansion_deltas','payload_json','INTERNAL','product_expansion','DE_PRODUCT_EXPANSION_REVIEW',0,1,'DE-GDPR-1'),
('platform_product_expansion_lineage','metadata_json','INTERNAL','product_expansion','DE_PRODUCT_EXPANSION_REVIEW',0,1,'DE-GDPR-1');
