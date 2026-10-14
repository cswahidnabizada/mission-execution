-- ON Mission 10.31.72 — Canonical Country Policy Safety
-- Safe follow-up for production schemas that already contain migrations 0047-0049.
-- Purpose:
--   1) Guarantee the complete subscription-policy capability schema.
--   2) Preserve all existing policy rows while making the schema explicit.
--   3) Treat country policy as data; no country receives special application logic.
--   4) Make Free Plan generic; any country can receive it through policy data.
--   5) Preserve Afghanistan as an ordinary country catalog record.
--   6) Preserve verification records, including historical BALM records, outside the active check table.
--   7) Remove BALM from the active canonical verification-check constraint.
--
-- IMPORTANT: run this file once against the production D1 database after 10.31.71.
-- It is intentionally a single transaction and includes verification queries at the end.

BEGIN TRANSACTION;

-- Rebuild subscription_policies with the complete canonical capability columns.
-- No foreign key in the application references this table, so the rebuild preserves
-- the policy primary keys and all existing rows without changing subscription records.
CREATE TABLE subscription_policies_72_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL,
  country_code TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  billing_mode TEXT NOT NULL DEFAULT 'paid',
  billing_period_days INTEGER NOT NULL DEFAULT 30,
  grace_days INTEGER NOT NULL DEFAULT 7,
  verification_required INTEGER NOT NULL DEFAULT 1,
  max_drivers INTEGER,
  max_missions_period INTEGER,
  max_storage_mb INTEGER,
  public_missions_enabled INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  subscription_class TEXT NOT NULL DEFAULT 'eligible',
  can_create_missions INTEGER NOT NULL DEFAULT 0,
  can_create_drivers INTEGER NOT NULL DEFAULT 0,
  can_share_foryou INTEGER NOT NULL DEFAULT 0,
  can_request_foryou INTEGER NOT NULL DEFAULT 0,
  can_share_network INTEGER NOT NULL DEFAULT 0,
  can_accept_network INTEGER NOT NULL DEFAULT 0,
  UNIQUE(subject_type,country_code,plan_code)
);

INSERT INTO subscription_policies_72_new (
  id,subject_type,country_code,plan_code,billing_mode,billing_period_days,grace_days,
  verification_required,max_drivers,max_missions_period,max_storage_mb,public_missions_enabled,
  active,created_at,updated_at,subscription_class,can_create_missions,can_create_drivers,
  can_share_foryou,can_request_foryou,can_share_network,can_accept_network
)
SELECT
  id,subject_type,country_code,plan_code,billing_mode,billing_period_days,grace_days,
  verification_required,max_drivers,max_missions_period,max_storage_mb,public_missions_enabled,
  active,created_at,updated_at,COALESCE(subscription_class,'eligible'),
  COALESCE(can_create_missions,0),COALESCE(can_create_drivers,0),COALESCE(can_share_foryou,0),
  COALESCE(can_request_foryou,0),COALESCE(can_share_network,0),COALESCE(can_accept_network,0)
FROM subscription_policies;

DROP TABLE subscription_policies;
ALTER TABLE subscription_policies_72_new RENAME TO subscription_policies;
CREATE INDEX IF NOT EXISTS idx_subscription_policies_lookup ON subscription_policies(subject_type,country_code,active);

-- Normalize Free Plan as generic policy data. No country is named here.
UPDATE subscription_policies
SET plan_code='free',subscription_class='exempt',billing_mode='free',
    grace_days=0,public_missions_enabled=0,
    updated_at=CURRENT_TIMESTAMP
WHERE billing_mode='free' AND subject_type='tenant_admin';

-- Any existing tenant free policy is a canonical Free Plan policy.
UPDATE subscription_policies
SET can_create_missions=1,
    can_create_drivers=1,
    can_share_foryou=0,
    can_request_foryou=0,
    can_share_network=1,
    can_accept_network=1,
    updated_at=CURRENT_TIMESTAMP
WHERE subject_type='tenant_admin' AND plan_code='free' AND billing_mode='free';

-- Ensure every active country can be configured with a generic Free Plan policy without
-- creating a country-specific application branch. Only the country code from the catalog
-- is used; the policy itself contains the rules.
INSERT OR IGNORE INTO subscription_policies (
  subject_type,country_code,plan_code,billing_mode,billing_period_days,grace_days,verification_required,
  max_drivers,max_missions_period,max_storage_mb,public_missions_enabled,active,
  subscription_class,can_create_missions,can_create_drivers,can_share_foryou,can_request_foryou,
  can_share_network,can_accept_network
)
SELECT
  'tenant_admin',cc.code,'free','free',30,0,1,5,200,1024,0,1,
  'exempt',1,1,0,0,1,1
FROM country_catalog cc
WHERE cc.active=1
  AND cc.default_subscription_class='exempt'
  AND NOT EXISTS (
    SELECT 1 FROM subscription_policies p
    WHERE p.subject_type='tenant_admin' AND p.country_code=cc.code AND p.plan_code='free' AND p.active=1
  );

-- Keep country defaults as policy metadata only. Afghanistan is not special here;
-- any country may be configured as exempt by a reviewer through canonical policy data.

-- Preserve historical BALM check rows before removing BALM from the active canonical table.
CREATE TABLE IF NOT EXISTS verification_check_legacy (
  id INTEGER PRIMARY KEY,
  profile_id INTEGER NOT NULL,
  check_type TEXT NOT NULL,
  status TEXT NOT NULL,
  method TEXT,
  verified_at TEXT,
  reviewer_note TEXT,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO verification_check_legacy
SELECT id,profile_id,check_type,status,method,verified_at,reviewer_note,updated_at
FROM verification_checks
WHERE check_type='balm';

-- Rebuild the active verification checks without BALM. All non-BALM records are copied intact.
CREATE TABLE verification_checks_72_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  check_type TEXT NOT NULL CHECK(check_type IN ('email','phone','company','country','identity')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','rejected','not_required')),
  method TEXT,
  verified_at TEXT,
  reviewer_note TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(profile_id) REFERENCES verification_profiles(id) ON DELETE CASCADE,
  UNIQUE(profile_id,check_type)
);
INSERT INTO verification_checks_72_new
(id,profile_id,check_type,status,method,verified_at,reviewer_note,updated_at)
SELECT id,profile_id,check_type,status,method,verified_at,reviewer_note,updated_at
FROM verification_checks
WHERE check_type<>'balm';
DROP TABLE verification_checks;
ALTER TABLE verification_checks_72_new RENAME TO verification_checks;
CREATE INDEX IF NOT EXISTS idx_verification_checks_profile ON verification_checks(profile_id,check_type,status);

-- Verified country is authoritative. Existing approved profiles retain their previously
-- accepted country; pending profiles remain pending until a reviewer verifies country.
UPDATE verification_profiles
SET declared_country_code=COALESCE(declared_country_code,country_code,'ZZ')
WHERE declared_country_code IS NULL;
UPDATE verification_profiles
SET verified_country_code=COALESCE(verified_country_code,country_code,'ZZ')
WHERE review_status='approved' AND verified_country_code IS NULL;

COMMIT;

-- =====================
-- POST-MIGRATION CHECKS
-- =====================
SELECT 'country_catalog_count' AS check_name, COUNT(*) AS value FROM country_catalog WHERE active=1;
SELECT 'free_plan_policy_count' AS check_name, COUNT(*) AS value FROM subscription_policies WHERE plan_code='free' AND billing_mode='free' AND subject_type='tenant_admin' AND active=1;
SELECT 'afghanistan_policy_rows' AS check_name, COUNT(*) AS value FROM subscription_policies WHERE country_code='AF' AND subject_type='tenant_admin' AND active=1;
SELECT 'balm_active_rows' AS check_name, COUNT(*) AS value FROM verification_checks WHERE check_type='balm';
SELECT 'balm_legacy_rows' AS check_name, COUNT(*) AS value FROM verification_check_legacy WHERE check_type='balm';
SELECT 'verified_country_profiles' AS check_name, COUNT(*) AS value FROM verification_profiles WHERE verified_country_code IS NOT NULL;
SELECT 'policy_capability_columns' AS check_name, COUNT(*) AS value
FROM pragma_table_info('subscription_policies')
WHERE name IN ('subscription_class','can_create_missions','can_create_drivers','can_share_foryou','can_request_foryou','can_share_network','can_accept_network');
