-- V8.8.1 — canonical mission state token + mission-scoped mutation lease
ALTER TABLE missions ADD COLUMN state_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE missions ADD COLUMN state_lock_token TEXT;
ALTER TABLE missions ADD COLUMN state_lock_at TEXT;
