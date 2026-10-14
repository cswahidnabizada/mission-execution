-- ON Mission 10.31.80 — Driver verification identity scope
-- Additive/safe migration: preserves every existing verification profile, check,
-- trust-key and audit relationship while allowing tenant-created drivers to own
-- an isolated verification profile of their own.

CREATE TABLE verification_profiles_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_type TEXT NOT NULL CHECK(identity_type IN ('tenant','executor','driver')),
  identity_id INTEGER NOT NULL,
  email_snapshot TEXT,
  phone_snapshot TEXT,
  company_name_snapshot TEXT,
  person_name_snapshot TEXT,
  country_code TEXT,
  declared_country_code TEXT,
  verified_country_code TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  postal_code TEXT,
  city TEXT,
  region TEXT,
  review_status TEXT NOT NULL DEFAULT 'draft'
    CHECK(review_status IN ('draft','pending','approved','rejected')),
  trust_level INTEGER NOT NULL DEFAULT 0,
  submitted_at TEXT,
  reviewed_at TEXT,
  reviewer_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(identity_type, identity_id)
);

INSERT INTO verification_profiles_new (
  id,identity_type,identity_id,email_snapshot,phone_snapshot,company_name_snapshot,person_name_snapshot,
  country_code,declared_country_code,verified_country_code,
  address_line1,address_line2,postal_code,city,region,
  review_status,trust_level,submitted_at,reviewed_at,reviewer_note,created_at,updated_at
)
SELECT
  id,identity_type,identity_id,email_snapshot,phone_snapshot,company_name_snapshot,NULL,
  country_code,declared_country_code,verified_country_code,
  address_line1,address_line2,postal_code,city,region,
  review_status,trust_level,submitted_at,reviewed_at,reviewer_note,created_at,updated_at
FROM verification_profiles;

DROP TABLE verification_profiles;
ALTER TABLE verification_profiles_new RENAME TO verification_profiles;

CREATE INDEX IF NOT EXISTS idx_verification_profiles_jurisdiction_review
ON verification_profiles(identity_type,identity_id,review_status,verified_country_code);

CREATE INDEX IF NOT EXISTS idx_verification_profiles_identity
ON verification_profiles(identity_type,identity_id);

-- No verification checks or trust keys are recreated: their profile_id values
-- remain unchanged because profile IDs were copied verbatim.
