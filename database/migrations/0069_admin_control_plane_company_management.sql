-- ON Mission 10.35.1 — Canonical Admin Control Plane & Company Management
-- D1 only. Administrative configuration is canonical; future residency providers remain abstracted.

CREATE TABLE IF NOT EXISTS company_management_profiles (
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
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','restricted','suspended','archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code)
);

CREATE INDEX IF NOT EXISTS idx_company_management_country ON company_management_profiles(country_code,status);
CREATE INDEX IF NOT EXISTS idx_company_management_sector ON company_management_profiles(sector_code,status);

CREATE TABLE IF NOT EXISTS organization_role_catalog (
  role_code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'tenant' CHECK(scope_type IN ('tenant','platform','network','mission')),
  active INTEGER NOT NULL DEFAULT 1,
  system_managed INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO organization_role_catalog(role_code,label,description,scope_type,system_managed) VALUES
('owner','Owner','Organization owner with authority over the company account.','tenant',1),
('admin','Administrator','Organization administrator for configuration and operational administration.','tenant',1),
('manager','Manager','Organization manager for delegated operational responsibilities.','tenant',0),
('operator','Operator','Organization operator for permitted operational work.','tenant',0),
('driver','Driver','Executor role for organization-managed execution.','tenant',1),
('developer','Developer','Technical organization role with explicitly granted development permissions.','tenant',0);

CREATE TABLE IF NOT EXISTS admin_control_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id INTEGER,
  target_company_id INTEGER,
  request_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_control_audit_created ON admin_control_audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_control_audit_company ON admin_control_audit_events(target_company_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_control_audit_resource ON admin_control_audit_events(resource_type,resource_id,created_at DESC);

-- Seed canonical management profiles for existing active companies without inventing legal facts.
INSERT OR IGNORE INTO company_management_profiles(company_id,legal_name,country_code,organization_type,sector_code,compliance_status,status)
SELECT c.id,c.name,COALESCE(cvs.country_code,'DE'),'company','general','configured',CASE WHEN c.deletion_status='active' THEN 'active' ELSE 'archived' END
FROM companies c
LEFT JOIN company_verification_status cvs ON cvs.company_id=c.id;

-- Bind existing organization policy sector/country to the canonical company management profile where available.
UPDATE company_management_profiles
SET country_code=COALESCE((SELECT jp.country_code FROM organization_compliance_policies ocp JOIN jurisdiction_policies jp ON jp.code=ocp.jurisdiction_code WHERE ocp.company_id=company_management_profiles.company_id LIMIT 1),country_code),
    sector_code=COALESCE((SELECT ocp.sector_code FROM organization_compliance_policies ocp WHERE ocp.company_id=company_management_profiles.company_id LIMIT 1),sector_code),
    updated_at=CURRENT_TIMESTAMP;

-- Ensure existing platform users have a tenant-scoped owner/admin binding available to the control-plane context.
INSERT OR IGNORE INTO platform_users(principal_type,principal_id,account_state)
SELECT 'tenant',c.id,CASE WHEN c.deletion_status='active' THEN 'active' ELSE 'deleted' END FROM companies c;
INSERT OR IGNORE INTO platform_user_roles(platform_user_id,role_code,scope_type,scope_id,active)
SELECT pu.id,'owner','tenant',pu.principal_id,1
FROM platform_users pu
WHERE pu.principal_type='tenant'
  AND EXISTS(SELECT 1 FROM auth_identities ai WHERE ai.company_id=pu.principal_id AND ai.role='admin' AND ai.active=1);

-- Govern the new administrative records themselves.
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('company_management_profiles','legal_name','CONFIDENTIAL','account_management','DE_ACCOUNT_DEFAULT',0,1,'DE-GDPR-1'),
('company_management_profiles','trading_name','INTERNAL','account_management','DE_ACCOUNT_DEFAULT',0,1,'DE-GDPR-1'),
('company_management_profiles','registration_number','PERSONAL','account_management','DE_ACCOUNT_DEFAULT',0,1,'DE-GDPR-1'),
('company_management_profiles','registration_authority','INTERNAL','account_management','DE_ACCOUNT_DEFAULT',0,1,'DE-GDPR-1'),
('company_management_profiles','registration_date','INTERNAL','account_management','DE_ACCOUNT_DEFAULT',0,1,'DE-GDPR-1'),
('company_management_profiles','country_code','INTERNAL','account_management','DE_ACCOUNT_DEFAULT',0,1,'DE-GDPR-1'),
('company_management_profiles','registered_address_line1','PERSONAL','account_management','DE_ACCOUNT_DEFAULT',0,1,'DE-GDPR-1'),
('company_management_profiles','registered_address_line2','PERSONAL','account_management','DE_ACCOUNT_DEFAULT',0,1,'DE-GDPR-1'),
('company_management_profiles','registered_postal_code','PERSONAL','account_management','DE_ACCOUNT_DEFAULT',0,1,'DE-GDPR-1'),
('company_management_profiles','registered_city','PERSONAL','account_management','DE_ACCOUNT_DEFAULT',0,1,'DE-GDPR-1'),
('company_management_profiles','region_code','INTERNAL','account_management','DE_ACCOUNT_DEFAULT',0,1,'DE-GDPR-1'),
('admin_control_audit_events','metadata','SECURITY_SENSITIVE','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1');
