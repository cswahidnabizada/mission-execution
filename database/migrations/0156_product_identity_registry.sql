-- Mission Execution 16.10.11 — canonical, versioned product identity.
-- Display identity is configuration; it never changes internal IDs or authorization semantics.
CREATE TABLE IF NOT EXISTS platform_product_identity_revisions (
  revision_id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 2 AND 80),
  short_name TEXT NOT NULL CHECK(length(short_name) BETWEEN 1 AND 12),
  tagline TEXT NOT NULL DEFAULT '' CHECK(length(tagline) <= 180),
  logo_asset_key TEXT,
  favicon_asset_key TEXT,
  scope TEXT NOT NULL DEFAULT 'platform' CHECK(scope IN ('platform','market','tenant')),
  scope_key TEXT NOT NULL DEFAULT 'global',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED','SUPERSEDED')),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 8 AND 500),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_by TEXT,
  published_at TEXT
);
CREATE TABLE IF NOT EXISTS platform_product_identity_active (
  singleton_id INTEGER PRIMARY KEY CHECK(singleton_id = 1),
  revision_id INTEGER NOT NULL REFERENCES platform_product_identity_revisions(revision_id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_product_identity_revisions_scope ON platform_product_identity_revisions(scope,scope_key,status,revision_id DESC);
CREATE INDEX IF NOT EXISTS idx_product_identity_revisions_created ON platform_product_identity_revisions(created_at DESC);
