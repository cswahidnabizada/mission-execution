-- ON Mission 10.34.0 — Privacy lifecycle, historical Truth preservation and critical audit durability.
-- Forward-only. Never rewrite prior migrations.

ALTER TABLE companies ADD COLUMN deletion_status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE companies ADD COLUMN deleted_at TEXT;
ALTER TABLE companies ADD COLUMN deletion_request_id INTEGER;

ALTER TABLE auth_identities ADD COLUMN deleted_at TEXT;
ALTER TABLE public_executor_identities ADD COLUMN deleted_at TEXT;
ALTER TABLE drivers ADD COLUMN deleted_at TEXT;

CREATE TABLE IF NOT EXISTS privacy_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  identity_type TEXT NOT NULL CHECK(identity_type IN ('tenant','executor','driver')),
  identity_id INTEGER NOT NULL,
  request_type TEXT NOT NULL CHECK(request_type IN ('access','rectification','erasure','restriction','export','objection','consent_withdrawal')),
  status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','processing','completed','partially_completed','restricted','rejected','cancelled')),
  reason TEXT,
  policy_version TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_at TEXT,
  completed_at TEXT,
  outcome_code TEXT,
  outcome_note TEXT
);

CREATE TABLE IF NOT EXISTS privacy_legal_holds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  identity_type TEXT,
  identity_id INTEGER,
  scope_type TEXT NOT NULL CHECK(scope_type IN ('account','company','mission','audit','file','evidence')),
  scope_id INTEGER,
  reason TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TEXT
);

CREATE TABLE IF NOT EXISTS critical_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  actor_role TEXT NOT NULL,
  actor_identity_id INTEGER,
  actor_driver_id INTEGER,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id INTEGER,
  request_id TEXT,
  phase TEXT NOT NULL CHECK(phase IN ('prepared','succeeded','failed','reconciled')),
  metadata TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_subject ON privacy_requests(identity_type,identity_id,status);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_company ON privacy_requests(company_id,status);
CREATE INDEX IF NOT EXISTS idx_privacy_holds_scope ON privacy_legal_holds(scope_type,scope_id,active);
CREATE INDEX IF NOT EXISTS idx_privacy_holds_company ON privacy_legal_holds(company_id,active);
CREATE INDEX IF NOT EXISTS idx_critical_audit_company_created ON critical_audit_events(company_id,created_at);
CREATE INDEX IF NOT EXISTS idx_critical_audit_phase ON critical_audit_events(phase,created_at);

-- Retention profiles used by the policy engine. Mission Truth is retained by policy review,
-- while communication content follows the configurable communications retention profile.
INSERT OR IGNORE INTO retention_policies(code,purpose_code,jurisdiction_code,sector_code,retention_days,action_after_expiry,legal_hold_allowed,version)
VALUES
('DE_COMMUNICATIONS_REVIEW','operational_communications','DE-GDPR-1','general',365,'review',1,'2'),
('DE_PRIVACY_REQUESTS','security_audit','DE-GDPR-1','general',1095,'review',1,'1');

-- The new governance records are themselves internal/security-sensitive metadata.
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('privacy_requests','reason','PERSONAL','security_audit','DE_PRIVACY_REQUESTS',0,1,'DE-GDPR-1'),
('privacy_requests','outcome_note','PERSONAL','security_audit','DE_PRIVACY_REQUESTS',0,1,'DE-GDPR-1'),
('privacy_legal_holds','reason','CONFIDENTIAL','security_audit','DE_PRIVACY_REQUESTS',0,1,'DE-GDPR-1'),
('critical_audit_events','metadata','SECURITY_SENSITIVE','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1'),
('critical_audit_events','error_code','INTERNAL','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1');

-- New German launch tenants are explicitly governed by the new privacy lifecycle version.
UPDATE organization_compliance_policies SET policy_version='10.34.0',updated_at=CURRENT_TIMESTAMP WHERE jurisdiction_code='DE-GDPR-1' AND status='configured';
