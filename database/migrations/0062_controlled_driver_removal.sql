-- ON Mission 10.31.95
-- Controlled executor removal preserves historical mission/account references.
ALTER TABLE drivers ADD COLUMN removed_at TEXT;
ALTER TABLE drivers ADD COLUMN removed_by_identity_id INTEGER;
ALTER TABLE drivers ADD COLUMN removal_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_drivers_company_active_removed ON drivers(company_id,active,removed_at,id);
