-- ON Mission 10.37.0 — Product Foundation
-- Canonical organization lifecycle + versioned product configuration foundation.
-- This migration does not create a second authorization, policy, mission truth, or billing authority.

PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS company_management_profiles_10370_backup AS SELECT * FROM company_management_profiles WHERE 0;

CREATE TABLE company_management_profiles_v2 (
  company_id INTEGER PRIMARY KEY,
  legal_name TEXT NOT NULL,
  trading_name TEXT,
  registration_number TEXT,
  registration_authority TEXT,
  registration_date TEXT,
  country_code TEXT NOT NULL,
  region_code TEXT,
  registered_address_line1 TEXT,
  registered_address_line2 TEXT,
  registered_postal_code TEXT,
  registered_city TEXT,
  organization_type TEXT NOT NULL DEFAULT 'company',
  sector_code TEXT NOT NULL DEFAULT 'general',
  organization_size TEXT,
  compliance_status TEXT NOT NULL DEFAULT 'configured' CHECK(compliance_status IN ('configured','pending','compliant','restricted','suspended')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ONBOARDING','PENDING_VERIFICATION','VERIFIED','ACTIVE','RESTRICTED','SUSPENDED','ARCHIVED')),
  status_reason TEXT,
  status_version INTEGER NOT NULL DEFAULT 1,
  status_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status_changed_by_type TEXT,
  status_changed_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code)
);

INSERT INTO company_management_profiles_v2(
  company_id,legal_name,trading_name,registration_number,registration_authority,registration_date,country_code,region_code,
  registered_address_line1,registered_address_line2,registered_postal_code,registered_city,organization_type,sector_code,organization_size,
  compliance_status,status,status_reason,status_version,status_updated_at,status_changed_by_type,status_changed_by_id,created_at,updated_at
)
SELECT company_id,legal_name,trading_name,registration_number,registration_authority,registration_date,country_code,region_code,
  registered_address_line1,registered_address_line2,registered_postal_code,registered_city,organization_type,sector_code,organization_size,
  compliance_status,
  CASE status WHEN 'active' THEN 'ACTIVE' WHEN 'restricted' THEN 'RESTRICTED' WHEN 'suspended' THEN 'SUSPENDED' WHEN 'archived' THEN 'ARCHIVED' ELSE 'DRAFT' END,
  '10.37.0 baseline lifecycle adoption',1,updated_at,'system','10.37.0',created_at,updated_at
FROM company_management_profiles;

DROP TABLE company_management_profiles;
ALTER TABLE company_management_profiles_v2 RENAME TO company_management_profiles;

CREATE INDEX IF NOT EXISTS idx_company_management_country ON company_management_profiles(country_code,status);
CREATE INDEX IF NOT EXISTS idx_company_management_sector ON company_management_profiles(sector_code,status);
CREATE INDEX IF NOT EXISTS idx_company_management_lifecycle ON company_management_profiles(status,status_version,updated_at);

DROP TABLE IF EXISTS company_management_profiles_10370_backup;

CREATE TABLE IF NOT EXISTS organization_lifecycle_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transition_id TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  transition_kind TEXT NOT NULL DEFAULT 'transition' CHECK(transition_kind IN ('initialization','transition')),
  reason_code TEXT NOT NULL,
  reason TEXT,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  request_id TEXT,
  expected_status_version INTEGER,
  resulting_status_version INTEGER NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_org_lifecycle_company_time ON organization_lifecycle_transitions(company_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_org_lifecycle_company_status ON organization_lifecycle_transitions(company_id,to_status,created_at DESC);

INSERT OR IGNORE INTO organization_lifecycle_transitions(
  transition_id,company_id,from_status,to_status,transition_kind,reason_code,reason,actor_type,actor_id,expected_status_version,resulting_status_version,metadata
)
SELECT 'org_init_10_37_0_'||company_id,company_id,NULL,status,'initialization','baseline_lifecycle_adoption','Existing organization adopted into canonical Product Foundation lifecycle.','system','10.37.0',NULL,status_version,
  json_object('release','10.37.0','source','company_management_profiles.status')
FROM company_management_profiles;

CREATE TABLE IF NOT EXISTS platform_configuration_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  configuration_id TEXT NOT NULL,
  domain_code TEXT NOT NULL,
  config_key TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','validated','active','retired')),
  payload_json TEXT NOT NULL,
  effective_at TEXT,
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  approved_by_type TEXT,
  approved_by_id TEXT,
  audit_event_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(configuration_id,version),
  UNIQUE(domain_code,config_key,version)
);

CREATE INDEX IF NOT EXISTS idx_platform_config_lookup ON platform_configuration_versions(domain_code,config_key,status,active);
CREATE INDEX IF NOT EXISTS idx_platform_config_effective ON platform_configuration_versions(effective_at,status,active);

INSERT OR IGNORE INTO platform_configuration_versions(
  configuration_id,domain_code,config_key,version,status,payload_json,effective_at,active,created_by_type,created_by_id,audit_event_id
) VALUES
('product_readiness_model','platform','product_readiness_model','1','active',
 '{"domains":["organization","onboarding","verification","trust","roles","capabilities","subscription","billing","communication","compliance","operational"],"authority":"canonical-runtime","release":"10.37.0"}',CURRENT_TIMESTAMP,1,'system','10.37.0','10.37.0');

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('organization_lifecycle_transitions','reason','CONFIDENTIAL','account_management','DE_ACCOUNT_DEFAULT',0,1,'DE-GDPR-1'),
('organization_lifecycle_transitions','metadata','SECURITY_SENSITIVE','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1'),
('platform_configuration_versions','payload_json','INTERNAL','compliance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_configuration_versions','created_by_id','SECURITY_SENSITIVE','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1'),
('platform_configuration_versions','approved_by_id','SECURITY_SENSITIVE','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1');

PRAGMA foreign_keys=ON;
