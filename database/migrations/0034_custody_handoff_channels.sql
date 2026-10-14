ALTER TABLE mission_custody_cases ADD COLUMN transfer_channel TEXT NOT NULL DEFAULT 'driver';
ALTER TABLE mission_custody_cases ADD COLUMN recipient_type TEXT;
ALTER TABLE mission_custody_cases ADD COLUMN recipient_id INTEGER;
ALTER TABLE mission_custody_cases ADD COLUMN distribution_status TEXT;

CREATE INDEX IF NOT EXISTS idx_custody_handoff_channel
ON mission_custody_cases(company_id,mission_id,transfer_channel,status);
