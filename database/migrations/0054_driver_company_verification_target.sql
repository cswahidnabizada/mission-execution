-- ON Mission 10.31.81 — Driver verification company target
-- Additive migration: records the tenant company a driver submits for reviewer verification.
ALTER TABLE verification_profiles ADD COLUMN company_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_verification_profiles_company_target
ON verification_profiles(identity_type,company_id,review_status);

UPDATE verification_profiles
SET company_id=identity_id
WHERE identity_type='tenant' AND company_id IS NULL;

UPDATE verification_profiles
SET company_id=(SELECT ai.company_id FROM auth_identities ai WHERE ai.driver_id=verification_profiles.identity_id AND ai.role='driver' AND ai.active=1 LIMIT 1)
WHERE identity_type='driver' AND company_id IS NULL;
