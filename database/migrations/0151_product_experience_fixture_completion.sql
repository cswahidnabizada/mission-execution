-- ON Mission 15.5.0 — Product Experience Fixture Completion
-- Environment configuration references canonical country/product authorities.
-- No demo fixture table becomes a second country/product/identity authority.

ALTER TABLE platform_environment_profiles ADD COLUMN country_code TEXT;
ALTER TABLE platform_environment_profiles ADD COLUMN product_definition_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_environment_profiles_country_product
  ON platform_environment_profiles(environment_code,country_code,product_definition_id,status);

CREATE TABLE IF NOT EXISTS platform_demo_product_profiles (
  product_code TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  source_product_definition_id INTEGER,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','RETIRED')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code),
  FOREIGN KEY(source_product_definition_id) REFERENCES platform_product_definitions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_demo_product_profiles_country_sector
  ON platform_demo_product_profiles(country_code,sector_code,status);

CREATE TABLE IF NOT EXISTS platform_demo_fixtures (
  fixture_code TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  tenant_id INTEGER,
  default_product_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'READY' CHECK(status IN ('READY','QUARANTINED','FAILED','RETIRED')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code),
  FOREIGN KEY(tenant_id) REFERENCES companies(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_demo_fixtures_status
  ON platform_demo_fixtures(status,updated_at DESC);

CREATE TABLE IF NOT EXISTS platform_demo_fixture_users (
  fixture_code TEXT NOT NULL,
  identity_id INTEGER NOT NULL,
  role_code TEXT NOT NULL,
  login TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(fixture_code,identity_id),
  FOREIGN KEY(identity_id) REFERENCES auth_identities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_demo_fixture_users_login
  ON platform_demo_fixture_users(fixture_code,login);

