-- ON Mission 10.33.0 — Canonical Compliance Context + Germany-first Data Governance + Private ForYou
-- Forward-only foundation. Existing truth/lifecycle/action tables remain authoritative.

CREATE TABLE IF NOT EXISTS jurisdiction_policies (
  code TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  region_code TEXT,
  framework_code TEXT NOT NULL,
  data_residency_mode TEXT NOT NULL DEFAULT 'policy',
  retention_profile TEXT NOT NULL DEFAULT 'default',
  deletion_profile TEXT NOT NULL DEFAULT 'default',
  identity_profile TEXT NOT NULL DEFAULT 'default',
  audit_profile TEXT NOT NULL DEFAULT 'default',
  effective_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(country_code,effective_version)
);

CREATE TABLE IF NOT EXISTS sector_policies (
  code TEXT PRIMARY KEY,
  sector_code TEXT NOT NULL,
  regulatory_profile TEXT NOT NULL DEFAULT 'general_operational',
  data_profile TEXT NOT NULL DEFAULT 'standard',
  effective_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(sector_code,effective_version)
);

CREATE TABLE IF NOT EXISTS organization_compliance_policies (
  company_id INTEGER PRIMARY KEY,
  jurisdiction_code TEXT NOT NULL,
  sector_code TEXT NOT NULL DEFAULT 'general',
  sector_policy_code TEXT NOT NULL DEFAULT 'general-v1',
  processing_profile TEXT NOT NULL DEFAULT 'operational_communications',
  residency_policy_code TEXT NOT NULL DEFAULT 'DE_PRIMARY',
  policy_version TEXT NOT NULL DEFAULT '10.33.0',
  status TEXT NOT NULL DEFAULT 'configured',
  configured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS processing_purposes (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  default_legal_basis TEXT NOT NULL,
  data_minimization_rule TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS legal_basis_catalog (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS retention_policies (
  code TEXT PRIMARY KEY,
  purpose_code TEXT NOT NULL,
  jurisdiction_code TEXT NOT NULL,
  sector_code TEXT NOT NULL DEFAULT 'general',
  retention_days INTEGER,
  action_after_expiry TEXT NOT NULL CHECK(action_after_expiry IN ('delete','anonymize','restrict','review')),
  legal_hold_allowed INTEGER NOT NULL DEFAULT 1,
  version TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(purpose_code) REFERENCES processing_purposes(code)
);

CREATE TABLE IF NOT EXISTS residency_policies (
  code TEXT PRIMARY KEY,
  jurisdiction_code TEXT NOT NULL,
  primary_region TEXT NOT NULL,
  primary_provider TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('required','preferred','policy')),
  fallback_allowed INTEGER NOT NULL DEFAULT 0,
  version TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS data_classification_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  classification TEXT NOT NULL CHECK(classification IN ('PUBLIC','INTERNAL','PERSONAL','CONFIDENTIAL','HIGHLY_SENSITIVE','SECURITY_SENSITIVE')),
  purpose_code TEXT NOT NULL,
  retention_policy_code TEXT NOT NULL,
  export_allowed INTEGER NOT NULL DEFAULT 0,
  audit_required INTEGER NOT NULL DEFAULT 0,
  jurisdiction_policy_code TEXT NOT NULL DEFAULT 'DE-GDPR-1',
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(table_name,column_name),
  FOREIGN KEY(purpose_code) REFERENCES processing_purposes(code),
  FOREIGN KEY(retention_policy_code) REFERENCES retention_policies(code),
  FOREIGN KEY(jurisdiction_policy_code) REFERENCES jurisdiction_policies(code)
);

CREATE TABLE IF NOT EXISTS consent_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  identity_type TEXT NOT NULL,
  identity_id INTEGER NOT NULL,
  purpose_code TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  granted INTEGER NOT NULL DEFAULT 1,
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  withdrawn_at TEXT,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(purpose_code) REFERENCES processing_purposes(code)
);

CREATE TABLE IF NOT EXISTS mission_access_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id INTEGER NOT NULL,
  owner_company_id INTEGER NOT NULL,
  code_hash TEXT NOT NULL,
  code_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked','expired')),
  expires_at TEXT,
  created_by_identity_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT,
  use_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  FOREIGN KEY(owner_company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mission_access_codes_active
  ON mission_access_codes(mission_id) WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_mission_access_codes_hash_status
  ON mission_access_codes(code_hash,status);
CREATE INDEX IF NOT EXISTS idx_data_classification_registry_table
  ON data_classification_registry(table_name,column_name);
CREATE INDEX IF NOT EXISTS idx_consent_records_identity_purpose
  ON consent_records(company_id,identity_type,identity_id,purpose_code,granted);

INSERT OR IGNORE INTO jurisdiction_policies(code,country_code,region_code,framework_code,data_residency_mode,retention_profile,deletion_profile,identity_profile,audit_profile,effective_version,status)
VALUES('DE-GDPR-1','DE','DE','EU_GDPR','required','DE_DEFAULT','DE_RIGHTS','DE_STANDARD_IDENTITY','DE_AUDIT','1','active');

INSERT OR IGNORE INTO jurisdiction_policies(code,country_code,region_code,framework_code,data_residency_mode,retention_profile,deletion_profile,identity_profile,audit_profile,effective_version,status)
VALUES('GLOBAL-POLICY-1','ZZ',NULL,'JURISDICTION_CONFIGURED','policy','DEFAULT','DEFAULT','DEFAULT','DEFAULT','1','active');

INSERT OR IGNORE INTO sector_policies(code,sector_code,regulatory_profile,data_profile,effective_version,status)
VALUES('general-v1','general','general_operational','standard','1','active');

INSERT OR IGNORE INTO processing_purposes(code,label,description,default_legal_basis,data_minimization_rule)
VALUES
('operational_communications','Operational communications','Mission-related communication between authorized organizations and executors needed to coordinate execution.','contract','Only data necessary to coordinate the mission and its authorized participants.'),
('mission_execution','Mission execution','Create, assign, execute, evidence and complete operational missions.','contract','Only data necessary for the operational mission.'),
('security_audit','Security and audit','Protect the platform, investigate security events and maintain required audit evidence.','legal_obligation','Record only security-relevant metadata.'),
('account_management','Account management','Authentication, account lifecycle and access administration.','contract','Only identity and account data necessary for secure access.'),
('billing','Billing','Subscription and payment administration.','contract','Only billing data required to administer the commercial relationship.');

INSERT OR IGNORE INTO legal_basis_catalog(code,label,description) VALUES
('contract','Contract','Processing necessary for performance of a contract or pre-contractual steps where applicable.'),
('legal_obligation','Legal obligation','Processing required to comply with an applicable legal obligation.'),
('legitimate_interests','Legitimate interests','Processing based on a documented legitimate interest after appropriate balancing.'),
('consent','Consent','Processing based on valid, purpose-specific consent where consent is the appropriate basis.');

INSERT OR IGNORE INTO retention_policies(code,purpose_code,jurisdiction_code,sector_code,retention_days,action_after_expiry,legal_hold_allowed,version)
VALUES
('DE_COMMUNICATIONS_DEFAULT','operational_communications','DE-GDPR-1','general',365,'delete',1,'1'),
('DE_MISSION_DEFAULT','mission_execution','DE-GDPR-1','general',NULL,'review',1,'1'),
('DE_SECURITY_AUDIT','security_audit','DE-GDPR-1','general',365,'delete',1,'1'),
('DE_ACCOUNT_DEFAULT','account_management','DE-GDPR-1','general',NULL,'restrict',1,'1'),
('DE_BILLING_DEFAULT','billing','DE-GDPR-1','general',NULL,'restrict',1,'1');

INSERT OR IGNORE INTO residency_policies(code,jurisdiction_code,primary_region,primary_provider,mode,fallback_allowed,version)
VALUES('DE_PRIMARY','DE-GDPR-1','DE','GERMAN_DATA_CENTER','required',0,'1'),
      ('GLOBAL_POLICY','GLOBAL-POLICY-1','policy','CONFIGURABLE_CLOUD_PROVIDER','policy',1,'1');

-- Existing German launch tenants are explicitly attached to the German policy.
INSERT OR IGNORE INTO organization_compliance_policies(company_id,jurisdiction_code,sector_code,sector_policy_code,processing_profile,residency_policy_code,policy_version,status)
SELECT id,'DE-GDPR-1','general','general-v1','operational_communications','DE_PRIMARY','10.33.0','configured'
FROM companies c;

-- Classification seed: every currently known table/column gets a deterministic baseline.
-- Sensitive/security columns are promoted by name; operational mission fields are confidential.
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
SELECT m.name,p.name,
CASE
 WHEN lower(p.name) GLOB '*password*' OR lower(p.name) GLOB '*salt*' OR lower(p.name) GLOB '*token*' OR lower(p.name) GLOB '*secret*' THEN 'SECURITY_SENSITIVE'
 WHEN lower(p.name) GLOB '*identity_id*' OR lower(p.name) GLOB '*identity_document*' OR lower(p.name) GLOB '*biometric*' THEN 'HIGHLY_SENSITIVE'
 WHEN lower(p.name) IN ('email','phone','mobile','login','address','address_line1','address_line2','postal_code','city','region','pickup_address','delivery_address','pickup_street','delivery_street','pickup_zip_code','delivery_zip_code','pickup_city','delivery_city','current_location') OR lower(p.name) GLOB '*_email' OR lower(p.name) GLOB '*_phone' THEN 'PERSONAL'
 WHEN m.name IN ('audit_logs','action_execution_telemetry','mission_transition_events','mission_status_history') THEN 'CONFIDENTIAL'
 WHEN m.name IN ('missions','mission_messages','mission_files','public_mission_requests','network_mission_invitations') THEN 'CONFIDENTIAL'
 ELSE 'INTERNAL'
END,
CASE WHEN m.name IN ('audit_logs','action_execution_telemetry','mission_transition_events','mission_status_history') THEN 'security_audit'
     WHEN m.name IN ('subscriptions','subscription_policies','stripe_customers') THEN 'billing'
     WHEN m.name IN ('auth_identities','verification_profiles','verification_checks','trust_keys','drivers','public_executor_identities','public_executor_profiles') THEN 'account_management'
     ELSE 'mission_execution' END,
CASE WHEN m.name IN ('audit_logs','action_execution_telemetry','mission_transition_events','mission_status_history') THEN 'DE_SECURITY_AUDIT'
     WHEN m.name IN ('subscriptions','subscription_policies','stripe_customers') THEN 'DE_BILLING_DEFAULT'
     WHEN m.name IN ('auth_identities','verification_profiles','verification_checks','trust_keys','drivers','public_executor_identities','public_executor_profiles') THEN 'DE_ACCOUNT_DEFAULT'
     ELSE 'DE_MISSION_DEFAULT' END,
CASE WHEN lower(p.name) IN ('password','password_hash','password_salt','password_iterations','token','secret') THEN 0 ELSE 1 END,
CASE WHEN m.name IN ('audit_logs','mission_transition_events','mission_status_history') THEN 1 ELSE 0 END,
'DE-GDPR-1'
FROM sqlite_master m
JOIN pragma_table_info(m.name) p ON 1=1
WHERE m.type='table' AND m.name NOT LIKE 'sqlite_%'
  AND m.name NOT IN ('d1_migrations');

-- 10.33.0 changes ForYou from public discovery to private code-based communication.
UPDATE missions SET public_enabled=0 WHERE public_enabled=1;
UPDATE public_mission_requests SET status='Revoked',updated_at=CURRENT_TIMESTAMP WHERE status='Pending';

CREATE TABLE IF NOT EXISTS compliance_action_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jurisdiction_code TEXT NOT NULL,
  sector_policy_code TEXT NOT NULL,
  action_code TEXT NOT NULL,
  purpose_code TEXT NOT NULL,
  allowed INTEGER NOT NULL DEFAULT 1,
  reason_code TEXT NOT NULL DEFAULT 'policy_allows',
  version TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(jurisdiction_code,sector_policy_code,action_code,version),
  FOREIGN KEY(jurisdiction_code) REFERENCES jurisdiction_policies(code),
  FOREIGN KEY(sector_policy_code) REFERENCES sector_policies(code),
  FOREIGN KEY(purpose_code) REFERENCES processing_purposes(code)
);

INSERT OR IGNORE INTO compliance_action_policies(jurisdiction_code,sector_policy_code,action_code,purpose_code,allowed,reason_code,version)
SELECT 'DE-GDPR-1','general-v1',a.code,'operational_communications',1,'policy_allows','1'
FROM (SELECT 'share_foryou' AS code UNION ALL SELECT 'request_foryou_mission' UNION ALL SELECT 'share_network' UNION ALL SELECT 'accept_network') a;

CREATE TABLE IF NOT EXISTS location_policies (
  code TEXT PRIMARY KEY,
  jurisdiction_code TEXT NOT NULL,
  resolution TEXT NOT NULL CHECK(resolution IN ('exact','approximate','operational','historical','none')),
  purpose_code TEXT NOT NULL,
  retention_policy_code TEXT NOT NULL,
  continuous_tracking_allowed INTEGER NOT NULL DEFAULT 0,
  sharing_allowed INTEGER NOT NULL DEFAULT 0,
  version TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(jurisdiction_code) REFERENCES jurisdiction_policies(code),
  FOREIGN KEY(purpose_code) REFERENCES processing_purposes(code),
  FOREIGN KEY(retention_policy_code) REFERENCES retention_policies(code)
);

INSERT OR IGNORE INTO location_policies(code,jurisdiction_code,resolution,purpose_code,retention_policy_code,continuous_tracking_allowed,sharing_allowed,version)
VALUES('DE_OPERATIONAL_LOCATION','DE-GDPR-1','operational','mission_execution','DE_MISSION_DEFAULT',0,0,'1');

UPDATE data_classification_registry SET classification='PERSONAL',purpose_code='mission_execution',retention_policy_code='DE_MISSION_DEFAULT',export_allowed=0,audit_required=1
WHERE lower(column_name) IN ('current_location','location_updated_at','pickup_latitude','pickup_longitude','delivery_latitude','delivery_longitude');
UPDATE data_classification_registry SET classification='PERSONAL',purpose_code='operational_communications',retention_policy_code='DE_COMMUNICATIONS_DEFAULT',export_allowed=1
WHERE table_name='mission_messages' AND lower(column_name)='message';
UPDATE data_classification_registry SET classification='PUBLIC',purpose_code='account_management',retention_policy_code='DE_ACCOUNT_DEFAULT',export_allowed=1,audit_required=0 WHERE table_name='country_catalog' AND column_name IN ('code','name','active','requires_review','default_subscription_class');
UPDATE data_classification_registry SET classification='PUBLIC',purpose_code='mission_execution',retention_policy_code='DE_MISSION_DEFAULT',export_allowed=1,audit_required=0 WHERE table_name='readiness_definitions' AND column_name IN ('code','label','description','actor_type','ordinal','active');
