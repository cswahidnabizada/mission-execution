-- ON Mission 10.71.8 — explicit Trash lifecycle evidence/reconciliation state.
-- SQLite/D1 ADD COLUMN requires constant defaults. Existing rows are backfilled after the ALTER.
-- This metadata never becomes resource truth; the canonical resource remains authoritative.
ALTER TABLE platform_trash_items ADD COLUMN evidence_status TEXT NOT NULL DEFAULT 'complete' CHECK(evidence_status IN ('complete','pending_reconciliation'));
ALTER TABLE platform_trash_items ADD COLUMN evidence_error_code TEXT;
ALTER TABLE platform_trash_items ADD COLUMN evidence_updated_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';
UPDATE platform_trash_items SET evidence_updated_at=CURRENT_TIMESTAMP WHERE evidence_updated_at='1970-01-01T00:00:00.000Z';
CREATE INDEX IF NOT EXISTS idx_platform_trash_evidence ON platform_trash_items(evidence_status,updated_at DESC,id DESC);
