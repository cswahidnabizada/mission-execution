-- Layout Studio server-owned draft/version foundation. Drafts are not active releases.
CREATE TABLE IF NOT EXISTS platform_layout_drafts (
  experience_id TEXT PRIMARY KEY CHECK(length(experience_id) BETWEEN 3 AND 80),
  draft_json TEXT NOT NULL CHECK(length(draft_json) BETWEEN 2 AND 500000),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_layout_draft_versions (
  version_id TEXT PRIMARY KEY,
  experience_id TEXT NOT NULL REFERENCES platform_layout_drafts(experience_id),
  revision INTEGER NOT NULL,
  draft_json TEXT NOT NULL CHECK(length(draft_json) BETWEEN 2 AND 500000),
  content_sha256 TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  change_reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(experience_id, revision)
);
CREATE INDEX IF NOT EXISTS idx_platform_layout_draft_versions_experience ON platform_layout_draft_versions(experience_id, revision DESC);
CREATE TABLE IF NOT EXISTS platform_layout_draft_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  experience_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('DRAFT_CREATED','DRAFT_SAVED','DRAFT_CONFLICT')),
  actor_id TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_platform_layout_draft_events_experience ON platform_layout_draft_events(experience_id, event_id DESC);
CREATE TRIGGER IF NOT EXISTS trg_platform_layout_draft_versions_no_update
BEFORE UPDATE ON platform_layout_draft_versions
BEGIN SELECT RAISE(ABORT, 'LAYOUT_DRAFT_VERSIONS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_platform_layout_draft_versions_no_delete
BEFORE DELETE ON platform_layout_draft_versions
BEGIN SELECT RAISE(ABORT, 'LAYOUT_DRAFT_VERSIONS_IMMUTABLE'); END;
