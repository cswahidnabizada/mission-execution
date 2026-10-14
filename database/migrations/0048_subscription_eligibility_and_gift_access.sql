-- ON Mission 10.31.69: explicit subscription eligibility + controlled gift access.
-- Subscription class is commercial policy, not authorization. Canonical action/services still enforce role, tenant, truth and custody.
ALTER TABLE subscription_policies ADD COLUMN subscription_class TEXT NOT NULL DEFAULT 'eligible';
ALTER TABLE subscription_policies ADD COLUMN can_create_missions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscription_policies ADD COLUMN can_create_drivers INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscription_policies ADD COLUMN can_share_foryou INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscription_policies ADD COLUMN can_request_foryou INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscription_policies ADD COLUMN can_share_network INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscription_policies ADD COLUMN can_accept_network INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS subscription_gift_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash TEXT NOT NULL UNIQUE,
  plan_code TEXT NOT NULL DEFAULT 'business',
  duration_days INTEGER NOT NULL DEFAULT 30,
  max_redemptions INTEGER NOT NULL DEFAULT 1,
  redeemed_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS subscription_access_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL UNIQUE,
  grant_type TEXT NOT NULL DEFAULT 'gift_card',
  plan_code TEXT NOT NULL,
  gift_code_id INTEGER,
  starts_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ends_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_subscription_gift_active ON subscription_gift_codes(active,expires_at);
CREATE INDEX IF NOT EXISTS idx_subscription_grant_company ON subscription_access_grants(company_id,active,ends_at);

-- Existing free/exempt policies.
UPDATE subscription_policies SET subscription_class='exempt',can_create_missions=1,can_create_drivers=1,can_share_foryou=0,can_request_foryou=0,can_share_network=1,can_accept_network=1
WHERE subject_type='tenant_admin' AND billing_mode='free';
UPDATE subscription_policies SET subscription_class='exempt',can_create_missions=0,can_create_drivers=0,can_share_foryou=0,can_request_foryou=1,can_share_network=0,can_accept_network=1
WHERE subject_type='independent_executor';
UPDATE subscription_policies SET subscription_class='eligible',can_create_missions=1,can_create_drivers=1,can_share_foryou=0,can_request_foryou=0,can_share_network=1,can_accept_network=1
WHERE subject_type='tenant_admin' AND plan_code='starter' AND billing_mode='paid';
UPDATE subscription_policies SET subscription_class='eligible',can_create_missions=1,can_create_drivers=1,can_share_foryou=1,can_request_foryou=1,can_share_network=1,can_accept_network=1
WHERE subject_type='tenant_admin' AND plan_code='business' AND billing_mode='paid';

-- Make currently selectable European/US tenant countries explicit policy rows. ZZ remains the safe product fallback.
INSERT OR IGNORE INTO subscription_policies
(subject_type,country_code,plan_code,billing_mode,billing_period_days,grace_days,verification_required,max_drivers,max_missions_period,max_storage_mb,public_missions_enabled,subscription_class,can_create_missions,can_create_drivers,can_share_foryou,can_request_foryou,can_share_network,can_accept_network)
SELECT 'tenant_admin',c.country_code,p.plan_code,p.billing_mode,p.billing_period_days,p.grace_days,p.verification_required,p.max_drivers,p.max_missions_period,p.max_storage_mb,p.public_missions_enabled,'eligible',p.plan_code IS NOT NULL,1,CASE WHEN p.plan_code='business' THEN 1 ELSE 0 END,CASE WHEN p.plan_code='business' THEN 1 ELSE 0 END,1,1
FROM (SELECT 'GB' country_code UNION ALL SELECT 'AT' UNION ALL SELECT 'CH' UNION ALL SELECT 'NL' UNION ALL SELECT 'BE' UNION ALL SELECT 'FR' UNION ALL SELECT 'PL' UNION ALL SELECT 'ES' UNION ALL SELECT 'IT' UNION ALL SELECT 'US' UNION ALL SELECT 'DE') c
JOIN subscription_policies p ON p.subject_type='tenant_admin' AND p.country_code='ZZ' AND p.plan_code IN ('starter','business')
WHERE p.active=1;
