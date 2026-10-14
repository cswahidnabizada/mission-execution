-- ON Mission 10.37.3 — People, Access & Capabilities
-- Canonical organization access layer. platform_user_roles remains the role authority;
-- invitations are onboarding records, not an alternate identity store.

CREATE TABLE IF NOT EXISTS organization_invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invitation_id TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  role_code TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'tenant' CHECK(scope_type IN ('tenant','network','mission')),
  scope_id INTEGER,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','accepted','expired','revoked')),
  expires_at TEXT NOT NULL,
  invited_by_identity_id INTEGER,
  accepted_identity_id INTEGER,
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(invited_by_identity_id) REFERENCES auth_identities(id) ON DELETE SET NULL,
  FOREIGN KEY(accepted_identity_id) REFERENCES auth_identities(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_org_invites_company_status ON organization_invitations(company_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_invites_email ON organization_invitations(email,status);
CREATE INDEX IF NOT EXISTS idx_org_invites_expiry ON organization_invitations(expires_at,status);

CREATE TABLE IF NOT EXISTS organization_capability_eligibility (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  capability_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'eligible' CHECK(status IN ('supported','available','eligible','restricted','retired')),
  source_type TEXT NOT NULL DEFAULT 'runtime',
  source_reference TEXT,
  reason_code TEXT,
  version TEXT NOT NULL DEFAULT '1',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,capability_code,version),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(capability_code) REFERENCES canonical_capability_registry(code)
);
CREATE INDEX IF NOT EXISTS idx_org_capability_company ON organization_capability_eligibility(company_id,status,active);
CREATE INDEX IF NOT EXISTS idx_org_capability_code ON organization_capability_eligibility(capability_code,status,active);

-- Canonicalize access for existing organizations without inventing new people.
-- platform_users are person principals. Older releases seeded organization-level compatibility
-- rows; the canonical access path now binds each authenticated tenant identity directly.
INSERT OR IGNORE INTO platform_users(principal_type,principal_id,account_state)
SELECT 'tenant',ai.id,CASE WHEN ai.active=1 AND c.deletion_status='active' THEN 'active' ELSE 'deactivated' END
FROM auth_identities ai JOIN companies c ON c.id=ai.company_id;

INSERT OR IGNORE INTO platform_user_actors(platform_user_id,actor_type,active)
SELECT pu.id,CASE WHEN ai.role='driver' THEN 'driver' ELSE 'tenant' END,CASE WHEN ai.active=1 THEN 1 ELSE 0 END
FROM platform_users pu JOIN auth_identities ai ON ai.id=pu.principal_id
WHERE pu.principal_type='tenant';

INSERT OR IGNORE INTO platform_user_memberships(platform_user_id,membership_type,membership_id,status)
SELECT pu.id,'tenant',ai.company_id,CASE WHEN ai.active=1 THEN 'active' ELSE 'suspended' END
FROM platform_users pu JOIN auth_identities ai ON ai.id=pu.principal_id
WHERE pu.principal_type='tenant';

INSERT OR IGNORE INTO platform_user_roles(platform_user_id,role_code,scope_type,scope_id,active)
SELECT pu.id,CASE WHEN ai.role='driver' THEN 'driver' WHEN ai.id=(SELECT MIN(ai2.id) FROM auth_identities ai2 WHERE ai2.company_id=ai.company_id AND ai2.role='admin' AND ai2.active=1) THEN 'owner' ELSE 'admin' END,'tenant',ai.company_id,1
FROM platform_users pu JOIN auth_identities ai ON ai.id=pu.principal_id
WHERE pu.principal_type='tenant' AND ai.active=1;

-- Seed current canonical platform capabilities as organization-level eligibility records.
INSERT OR IGNORE INTO organization_capability_eligibility(company_id,capability_code,status,source_type,source_reference,reason_code,version,active)
SELECT c.id,cc.code,'eligible','canonical_registry',cc.code,'registry_active','1',1
FROM companies c
CROSS JOIN canonical_capability_registry cc
WHERE c.deletion_status='active' AND cc.status='active'
  AND cc.code IN ('identity','organization','people','mission','object','resource','relationship','communication','evidence','policy','capability','logistics');

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('organization_invitations','email','PERSONAL','account_management','DE_ACCOUNT_DEFAULT',0,1,'DE-GDPR-1'),
('organization_invitations','token_hash','SECURITY_SENSITIVE','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1'),
('organization_invitations','metadata','INTERNAL','account_management','DE_ACCOUNT_DEFAULT',0,1,'DE-GDPR-1'),
('organization_capability_eligibility','reason_code','INTERNAL','compliance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');
