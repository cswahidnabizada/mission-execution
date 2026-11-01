-- 0166: record versioned legal acknowledgement for Germany Logistics onboarding.
ALTER TABLE organization_onboarding_records ADD COLUMN terms_accepted_version TEXT;
ALTER TABLE organization_onboarding_records ADD COLUMN privacy_notice_acknowledged_version TEXT;
ALTER TABLE organization_onboarding_records ADD COLUMN legal_acknowledged_at TEXT;
