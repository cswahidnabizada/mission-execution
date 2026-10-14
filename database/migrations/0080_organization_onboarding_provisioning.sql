-- ON Mission 10.37.2 — Canonical Organization + Onboarding + Provisioning
-- Runtime-owned requirements and idempotent/recoverable provisioning. No second auth/lifecycle authority.
CREATE TABLE IF NOT EXISTS organization_onboarding_records (
  company_id INTEGER PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  purpose_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  organization_type TEXT NOT NULL,
  country_code TEXT NOT NULL,
  jurisdiction_code TEXT NOT NULL,
  requirement_snapshot TEXT NOT NULL DEFAULT '{}',
  verification_requirement_snapshot TEXT NOT NULL DEFAULT '[]',
  capability_eligibility_snapshot TEXT NOT NULL DEFAULT '[]',
  subscription_eligibility_class TEXT NOT NULL DEFAULT 'eligible',
  owner_identity_id INTEGER,
  review_status TEXT NOT NULL DEFAULT 'pending',
  provisioning_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(provisioning_status IN ('PENDING','RUNNING','COMPLETED','PROVISIONING_FAILED')),
  provisioning_step TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code),
  FOREIGN KEY(jurisdiction_code) REFERENCES jurisdiction_policies(code),
  FOREIGN KEY(purpose_code) REFERENCES processing_purposes(code),
  FOREIGN KEY(owner_identity_id) REFERENCES auth_identities(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_org_onboarding_status ON organization_onboarding_records(provisioning_status,updated_at);
CREATE INDEX IF NOT EXISTS idx_org_onboarding_country ON organization_onboarding_records(country_code,jurisdiction_code);

CREATE TABLE IF NOT EXISTS organization_provisioning_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  attempt INTEGER NOT NULL,
  step_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('started','succeeded','failed','reconciled')),
  idempotency_key TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_org_provision_events_company ON organization_provisioning_events(company_id,created_at DESC,id DESC);

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('organization_onboarding_records','requirement_snapshot','CONFIDENTIAL','account_management','DE_ACCOUNT_DEFAULT',0,1,'DE-GDPR-1'),
('organization_onboarding_records','verification_requirement_snapshot','CONFIDENTIAL','identity_verification','DE_IDENTITY_VERIFICATION',0,1,'DE-GDPR-1'),
('organization_onboarding_records','capability_eligibility_snapshot','INTERNAL','account_management','DE_ACCOUNT_DEFAULT',0,1,'DE-GDPR-1'),
('organization_onboarding_records','last_error_message','SECURITY_SENSITIVE','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1'),
('organization_provisioning_events','error_message','SECURITY_SENSITIVE','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1');
