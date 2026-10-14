-- ON Mission 10.31.63 — canonical onboarding classification and jurisdiction input.
ALTER TABLE verification_profiles ADD COLUMN country_code TEXT NOT NULL DEFAULT 'ZZ';
ALTER TABLE public_executor_profiles ADD COLUMN country_code TEXT NOT NULL DEFAULT 'ZZ';
CREATE INDEX IF NOT EXISTS idx_verification_profiles_country ON verification_profiles(country_code,identity_type);
CREATE INDEX IF NOT EXISTS idx_executor_profiles_country ON public_executor_profiles(country_code);
