-- ON Mission 10.31.62 — Reconcile approved tenant verification into canonical company status.
-- Repairs registrations approved before the reviewer approval path synchronized company_verification_status.
UPDATE company_verification_status
SET status='verified',
    country_code='DE',
    verified_at=COALESCE(verified_at,CURRENT_TIMESTAMP),
    updated_at=CURRENT_TIMESTAMP
WHERE company_id IN (
  SELECT identity_id
  FROM verification_profiles
  WHERE identity_type='tenant' AND review_status='approved'
);
