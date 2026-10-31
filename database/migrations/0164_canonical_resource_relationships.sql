-- 0164: Canonical, typed resource relationship edges.
-- Edges reference existing owner-held resource identities; they never duplicate endpoint assets.
CREATE TABLE IF NOT EXISTS platform_resource_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_resource_type TEXT NOT NULL,
  from_resource_id TEXT NOT NULL,
  to_resource_type TEXT NOT NULL,
  to_resource_id TEXT NOT NULL,
  relation_type TEXT NOT NULL CHECK (relation_type IN ('depends_on')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (NOT (from_resource_type = to_resource_type AND from_resource_id = to_resource_id)),
  UNIQUE (from_resource_type, from_resource_id, to_resource_type, to_resource_id, relation_type)
);
CREATE INDEX IF NOT EXISTS idx_platform_resource_relationships_from
  ON platform_resource_relationships(from_resource_type, from_resource_id, status);
CREATE INDEX IF NOT EXISTS idx_platform_resource_relationships_to
  ON platform_resource_relationships(to_resource_type, to_resource_id, status);

-- Serialize graph-changing commits so concurrent opposite-direction edges cannot bypass cycle checks.
CREATE TABLE IF NOT EXISTS platform_resource_relationship_leases (
  lock_key TEXT PRIMARY KEY,
  lease_token TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
