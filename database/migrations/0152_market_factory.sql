-- ON Mission 16.0.0 — Market Factory / governed market package registry
-- Market packages compose canonical authorities; they never become a second country,
-- sector, policy, content, action, capability or mission-truth authority.
CREATE TABLE IF NOT EXISTS platform_market_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_key TEXT NOT NULL UNIQUE,
  product_key TEXT NOT NULL DEFAULT 'on_mission',
  country_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','LIVE','RESTRICTED','SUSPENDED','RETIRED')),
  onboarding_mode TEXT NOT NULL DEFAULT 'OPEN' CHECK(onboarding_mode IN ('OPEN','INVITE_ONLY','CLOSED')),
  active_version_id INTEGER,
  previous_version_id INTEGER,
  created_by_type TEXT,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(country_code) REFERENCES platform_product_country_catalog(code)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_market_package_product_country
  ON platform_market_packages(product_key,country_code);
CREATE INDEX IF NOT EXISTS idx_market_packages_status
  ON platform_market_packages(status,updated_at DESC);

CREATE TABLE IF NOT EXISTS platform_market_package_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id INTEGER NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'IMPORTED' CHECK(status IN ('IMPORTED','DRAFT','NORMALIZED','VALIDATED','READY','AUTHORIZED','PUBLISHED','VERIFIED','LIVE','REPLACED','SUSPENDED','RETIRED','REJECTED')),
  source_format TEXT NOT NULL DEFAULT 'json' CHECK(source_format IN ('json','zip','export')),
  source_hash TEXT NOT NULL,
  package_json TEXT NOT NULL DEFAULT '{}',
  import_report_json TEXT NOT NULL DEFAULT '{}',
  readiness_json TEXT NOT NULL DEFAULT '{}',
  dependency_snapshot_json TEXT NOT NULL DEFAULT '{}',
  contract_hash TEXT,
  launch_id INTEGER,
  previous_version_id INTEGER,
  authorized_by_type TEXT,
  authorized_by_id TEXT,
  authorized_at TEXT,
  published_at TEXT,
  verified_at TEXT,
  live_at TEXT,
  created_by_type TEXT,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(package_id,version),
  FOREIGN KEY(package_id) REFERENCES platform_market_packages(id) ON DELETE CASCADE,
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE SET NULL,
  FOREIGN KEY(previous_version_id) REFERENCES platform_market_package_versions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_market_package_versions_status
  ON platform_market_package_versions(package_id,status,updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_market_package_source_hash
  ON platform_market_package_versions(package_id,source_hash);

CREATE TABLE IF NOT EXISTS platform_market_package_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_version_id INTEGER NOT NULL,
  source_format TEXT NOT NULL,
  source_name TEXT,
  source_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACCEPTED' CHECK(status IN ('ACCEPTED','REJECTED')),
  manifest_json TEXT NOT NULL DEFAULT '{}',
  errors_json TEXT NOT NULL DEFAULT '[]',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  created_by_type TEXT,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(package_version_id) REFERENCES platform_market_package_versions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_market_package_imports_version
  ON platform_market_package_imports(package_version_id,created_at DESC);

CREATE TABLE IF NOT EXISTS platform_market_release_contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_version_id INTEGER NOT NULL UNIQUE,
  contract_hash TEXT NOT NULL UNIQUE,
  contract_json TEXT NOT NULL,
  verification_json TEXT NOT NULL DEFAULT '{}',
  dependency_snapshot_json TEXT NOT NULL DEFAULT '{}',
  rollback_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'AUTHORIZED' CHECK(status IN ('AUTHORIZED','PUBLISHED','VERIFIED','LIVE','REPLACED','SUSPENDED','RETIRED')),
  authorized_by_type TEXT,
  authorized_by_id TEXT,
  authorized_at TEXT,
  published_at TEXT,
  verified_at TEXT,
  live_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(package_version_id) REFERENCES platform_market_package_versions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_market_release_contract_status
  ON platform_market_release_contracts(status,updated_at DESC);

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('platform_market_package_versions','package_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_market_package_versions','import_report_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_market_package_versions','dependency_snapshot_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_market_release_contracts','contract_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');
