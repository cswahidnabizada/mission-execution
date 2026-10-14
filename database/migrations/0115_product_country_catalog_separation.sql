-- ON Mission 10.61.0 — Separate Product Country Catalog from Registration Country Catalog.
-- country_catalog remains the registration/jurisdiction reference catalog.
-- platform_product_country_catalog is the canonical Product Factory market catalog.
-- Product launch/blueprint records must reference a deliberately created product country.

PRAGMA foreign_keys=OFF;

CREATE TABLE platform_product_country_catalog (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  requires_review INTEGER NOT NULL DEFAULT 1 CHECK(requires_review IN (0,1)),
  default_subscription_class TEXT NOT NULL DEFAULT 'eligible',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO platform_product_country_catalog(code,name,active,requires_review,default_subscription_class)
SELECT DISTINCT c.code,c.name,c.active,c.requires_review,c.default_subscription_class
FROM country_catalog c
JOIN (
  SELECT country_code FROM country_product_launches
  UNION
  SELECT country_code FROM platform_country_product_blueprints
) used ON used.country_code=c.code;

CREATE INDEX idx_product_country_catalog_active_name
  ON platform_product_country_catalog(active,name);
CREATE INDEX idx_product_country_catalog_active_updated
  ON platform_product_country_catalog(active,updated_at DESC,created_at DESC);

CREATE TABLE platform_country_product_blueprints_new (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 country_code TEXT NOT NULL,
 name TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','researching','preparing','ready','archived')),
 default_language_code TEXT NOT NULL DEFAULT 'en',
 notes TEXT NOT NULL DEFAULT '',
 created_by_type TEXT NOT NULL,
 created_by_id TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, data_entry_id TEXT,
 UNIQUE(country_code),
 FOREIGN KEY(country_code) REFERENCES platform_product_country_catalog(code)
);
INSERT INTO platform_country_product_blueprints_new
(id,country_code,name,status,default_language_code,notes,created_by_type,created_by_id,created_at,updated_at,data_entry_id)
SELECT id,country_code,name,status,default_language_code,notes,created_by_type,created_by_id,created_at,updated_at,data_entry_id
FROM platform_country_product_blueprints;
DROP TABLE platform_country_product_blueprints;
ALTER TABLE platform_country_product_blueprints_new RENAME TO platform_country_product_blueprints;
CREATE INDEX idx_country_blueprints_country_status ON platform_country_product_blueprints(country_code,status,updated_at DESC);

CREATE TABLE country_product_launches_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','validated','active','retired')),
  manifest_json TEXT NOT NULL DEFAULT '{}',
  eligibility_json TEXT NOT NULL DEFAULT '{}',
  readiness_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  effective_at TEXT,
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, country_blueprint_id INTEGER REFERENCES platform_country_product_blueprints(id), data_entry_id TEXT,
  UNIQUE(country_code,version),
  FOREIGN KEY(country_code) REFERENCES platform_product_country_catalog(code)
);
INSERT INTO country_product_launches_new
(id,country_code,version,status,manifest_json,eligibility_json,readiness_json,active,effective_at,created_by_type,created_by_id,created_at,updated_at,country_blueprint_id,data_entry_id)
SELECT id,country_code,version,status,manifest_json,eligibility_json,readiness_json,active,effective_at,created_by_type,created_by_id,created_at,updated_at,country_blueprint_id,data_entry_id
FROM country_product_launches;
DROP TABLE country_product_launches;
ALTER TABLE country_product_launches_new RENAME TO country_product_launches;
CREATE INDEX idx_country_product_launch_active ON country_product_launches(country_code,status,active);
CREATE INDEX idx_country_product_launch_status ON country_product_launches(status,updated_at DESC);

PRAGMA foreign_keys=ON;
