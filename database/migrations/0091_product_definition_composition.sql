-- ON Mission 10.38.20 — Product Definition & Composition Engine
-- Product definitions are composition records, not a replacement for canonical runtime authorities.
CREATE TABLE IF NOT EXISTS platform_product_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','compiled','verified','active','retired')),
  base_definition_id INTEGER,
  launch_id INTEGER,
  definition_version INTEGER NOT NULL DEFAULT 1,
  compiled_version INTEGER,
  compiled_hash TEXT,
  compiled_at TEXT,
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_key, definition_version),
  FOREIGN KEY(base_definition_id) REFERENCES platform_product_definitions(id) ON DELETE SET NULL,
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE SET NULL,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code)
);

CREATE INDEX IF NOT EXISTS idx_product_definition_lookup
ON platform_product_definitions(country_code,sector_code,status,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_product_definition_launch
ON platform_product_definitions(launch_id,status,id DESC);

CREATE TABLE IF NOT EXISTS platform_product_definition_components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  definition_id INTEGER NOT NULL,
  component_type TEXT NOT NULL CHECK(component_type IN ('identity','vocabulary','content','capability','workflow','role','experience','policy','integration','dependency')),
  component_key TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'inline' CHECK(source_type IN ('inline','platform_configuration','country_blueprint','capability_registry','base_definition')),
  source_ref TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','validated','blocked')),
  version INTEGER NOT NULL DEFAULT 1,
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(definition_id,component_type,component_key,version),
  FOREIGN KEY(definition_id) REFERENCES platform_product_definitions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_definition_components
ON platform_product_definition_components(definition_id,component_type,status,component_key);

CREATE TABLE IF NOT EXISTS platform_product_definition_manifests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  definition_id INTEGER NOT NULL,
  definition_version INTEGER NOT NULL,
  manifest_json TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'compiled' CHECK(status IN ('compiled','verified','active','retired')),
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(definition_id,definition_version,manifest_hash),
  FOREIGN KEY(definition_id) REFERENCES platform_product_definitions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_product_definition_manifests
ON platform_product_definition_manifests(definition_id,definition_version DESC,id DESC);

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('platform_product_definitions','description','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_product_definition_components','payload_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_product_definition_manifests','manifest_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');
