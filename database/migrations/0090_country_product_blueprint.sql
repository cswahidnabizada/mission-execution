CREATE TABLE platform_country_product_blueprints (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 country_code TEXT NOT NULL,
 name TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','researching','preparing','ready','archived')),
 default_language_code TEXT NOT NULL DEFAULT 'en',
 notes TEXT NOT NULL DEFAULT '',
 created_by_type TEXT NOT NULL,
 created_by_id TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(country_code),
 FOREIGN KEY(country_code) REFERENCES country_catalog(code)
);
CREATE TABLE platform_country_product_languages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 blueprint_id INTEGER NOT NULL,
 language_code TEXT NOT NULL,
 language_name TEXT NOT NULL,
 is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(blueprint_id,language_code),
 FOREIGN KEY(blueprint_id) REFERENCES platform_country_product_blueprints(id) ON DELETE CASCADE
);
CREATE TABLE platform_country_product_sectors (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 blueprint_id INTEGER NOT NULL,
 sector_code TEXT NOT NULL,
 sector_name TEXT NOT NULL,
 notes TEXT NOT NULL DEFAULT '',
 required INTEGER NOT NULL DEFAULT 1 CHECK(required IN (0,1)),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','blocked')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(blueprint_id,sector_code),
 FOREIGN KEY(blueprint_id) REFERENCES platform_country_product_blueprints(id) ON DELETE CASCADE
);
CREATE TABLE platform_country_product_contents (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 blueprint_id INTEGER NOT NULL,
 content_key TEXT NOT NULL,
 category TEXT NOT NULL,
 title TEXT NOT NULL,
 body TEXT NOT NULL DEFAULT '',
 language_code TEXT NOT NULL DEFAULT 'en',
 required INTEGER NOT NULL DEFAULT 0 CHECK(required IN (0,1)),
 status TEXT NOT NULL DEFAULT 'missing' CHECK(status IN ('missing','draft','ready')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(blueprint_id,content_key,language_code),
 FOREIGN KEY(blueprint_id) REFERENCES platform_country_product_blueprints(id) ON DELETE CASCADE
);
CREATE TABLE platform_country_product_legal_requirements (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 blueprint_id INTEGER NOT NULL,
 requirement_key TEXT NOT NULL,
 title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 source_url TEXT NOT NULL DEFAULT '',
 required INTEGER NOT NULL DEFAULT 1 CHECK(required IN (0,1)),
 status TEXT NOT NULL DEFAULT 'missing' CHECK(status IN ('missing','researching','prepared','reviewed')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(blueprint_id,requirement_key),
 FOREIGN KEY(blueprint_id) REFERENCES platform_country_product_blueprints(id) ON DELETE CASCADE
);
ALTER TABLE country_product_launches ADD COLUMN country_blueprint_id INTEGER REFERENCES platform_country_product_blueprints(id);
CREATE INDEX idx_country_blueprints_country_status ON platform_country_product_blueprints(country_code,status,updated_at DESC);
CREATE INDEX idx_country_blueprint_languages ON platform_country_product_languages(blueprint_id,is_primary,enabled);
CREATE INDEX idx_country_blueprint_sectors ON platform_country_product_sectors(blueprint_id,status,required);
CREATE INDEX idx_country_blueprint_contents ON platform_country_product_contents(blueprint_id,language_code,status,required);
CREATE INDEX idx_country_blueprint_legal ON platform_country_product_legal_requirements(blueprint_id,status,required);
