-- ON Mission 10.31.79 — Canonical Country Address & Readiness Reconciliation
-- Additive migration. Stores the account holder's submitted jurisdiction address
-- inside the verification profile. Verified country remains reviewer-controlled.

ALTER TABLE verification_profiles ADD COLUMN address_line1 TEXT;
ALTER TABLE verification_profiles ADD COLUMN address_line2 TEXT;
ALTER TABLE verification_profiles ADD COLUMN postal_code TEXT;
ALTER TABLE verification_profiles ADD COLUMN city TEXT;
ALTER TABLE verification_profiles ADD COLUMN region TEXT;

CREATE INDEX IF NOT EXISTS idx_verification_profiles_jurisdiction_review
ON verification_profiles(identity_type,identity_id,review_status,verified_country_code);

-- A country is never considered verified merely because a legacy profile was approved.
-- The country check and verified_country_code are the canonical jurisdiction authorities.
UPDATE verification_profiles
SET verified_country_code=NULL
WHERE verified_country_code='ZZ'
  AND EXISTS (SELECT 1 FROM verification_checks vc WHERE vc.profile_id=verification_profiles.id AND vc.check_type='country' AND vc.status<>'verified');

UPDATE verification_profiles
SET review_status='pending', trust_level=0, updated_at=CURRENT_TIMESTAMP
WHERE review_status='approved'
  AND EXISTS (SELECT 1 FROM verification_checks vc WHERE vc.profile_id=verification_profiles.id AND vc.check_type='country' AND vc.status<>'verified');

UPDATE trust_keys
SET status='suspended',suspended_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
WHERE status='active'
  AND profile_id IN (SELECT vp.id FROM verification_profiles vp WHERE vp.review_status<>'approved' OR EXISTS (SELECT 1 FROM verification_checks vc WHERE vc.profile_id=vp.id AND vc.check_type='country' AND vc.status<>'verified'));
