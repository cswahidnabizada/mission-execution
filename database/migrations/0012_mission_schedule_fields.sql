-- V7.2.5: explicit mission schedule fields.
-- Preserve old deadline semantics by backfilling deadline_at from mission_date + mission_end_time.

ALTER TABLE missions ADD COLUMN pickup_time TEXT;
ALTER TABLE missions ADD COLUMN delivery_time TEXT;
ALTER TABLE missions ADD COLUMN deadline_at TEXT;

UPDATE missions
SET deadline_at = CASE
  WHEN mission_date IS NOT NULL AND mission_end_time IS NOT NULL AND mission_end_time!=''
    THEN mission_date || 'T' || mission_end_time
  ELSE deadline_at
END
WHERE deadline_at IS NULL;
