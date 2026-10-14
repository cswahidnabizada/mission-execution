-- V7.2.6: canonical UTC schedule moments.
-- Existing V7.2.5 local fields remain untouched because their original timezone cannot
-- be inferred safely from SQL alone. New/edited missions populate these UTC columns.
ALTER TABLE missions ADD COLUMN pickup_at_utc TEXT;
ALTER TABLE missions ADD COLUMN delivery_at_utc TEXT;
ALTER TABLE missions ADD COLUMN deadline_at_utc TEXT;
ALTER TABLE missions ADD COLUMN schedule_timezone TEXT;

CREATE INDEX IF NOT EXISTS idx_missions_deadline_utc ON missions(deadline_at_utc);
