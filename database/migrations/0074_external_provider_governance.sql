-- ON Mission 10.35.6 — Canonical External Provider Governance
CREATE TABLE IF NOT EXISTS external_provider_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK(provider_type IN ('internal','storage','email','payment','identity','analytics','other')),
  endpoint TEXT, country_code TEXT NOT NULL DEFAULT 'ZZ', jurisdiction_code TEXT NOT NULL DEFAULT 'GLOBAL-POLICY-1',
  region_code TEXT, residency_mode TEXT NOT NULL DEFAULT 'policy' CHECK(residency_mode IN ('required','preferred','policy')),
  transfer_mechanism TEXT NOT NULL DEFAULT 'none', contract_status TEXT NOT NULL DEFAULT 'configured' CHECK(contract_status IN ('configured','approved','expired','blocked','pending_review')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), version TEXT NOT NULL DEFAULT '1',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS external_provider_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT, provider_code TEXT NOT NULL, company_id INTEGER, country_code TEXT NOT NULL DEFAULT 'ZZ',
  purpose_code TEXT NOT NULL, classification TEXT NOT NULL CHECK(classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','PERSONAL','HIGHLY_SENSITIVE','SECURITY_SENSITIVE')),
  allowed_data_fields TEXT NOT NULL DEFAULT '[]', retention_policy_code TEXT,
  transfer_policy TEXT NOT NULL DEFAULT 'same_jurisdiction' CHECK(transfer_policy IN ('same_jurisdiction','adequacy','safeguards','approved_transfer','none')),
  authorization_scope TEXT NOT NULL, audit_required INTEGER NOT NULL DEFAULT 1 CHECK(audit_required IN (0,1)),
  minimize INTEGER NOT NULL DEFAULT 1 CHECK(minimize IN (0,1)), version TEXT NOT NULL DEFAULT '1', active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  effective_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(provider_code) REFERENCES external_provider_registry(code), FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(purpose_code) REFERENCES processing_purposes(code), FOREIGN KEY(retention_policy_code) REFERENCES retention_policies(code)
);
CREATE INDEX IF NOT EXISTS idx_external_provider_policy_scope ON external_provider_policies(provider_code,company_id,country_code,active,effective_at DESC);
CREATE TABLE IF NOT EXISTS external_provider_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, provider_code TEXT NOT NULL, company_id INTEGER, country_code TEXT NOT NULL,
  purpose_code TEXT NOT NULL, classification TEXT NOT NULL, authorization_scope TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('allowed','blocked')), operation TEXT NOT NULL, data_fields TEXT NOT NULL DEFAULT '[]',
  transfer_policy TEXT, policy_version TEXT, request_id TEXT, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(provider_code) REFERENCES external_provider_registry(code), FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_external_provider_audit_provider ON external_provider_audit_events(provider_code,company_id,created_at DESC);
INSERT OR IGNORE INTO external_provider_registry(code,name,provider_type,endpoint,country_code,jurisdiction_code,region_code,residency_mode,transfer_mechanism,contract_status,version) VALUES
('in_app','ON Mission In-App Delivery','internal',NULL,'ZZ','GLOBAL-POLICY-1',NULL,'policy','none','approved','1'),
('r2_primary','ON Mission Object Storage','storage','R2','DE','DE-GDPR-1','DE','required','same_jurisdiction','approved','1'),
('resend','Resend Transactional Email','email','https://api.resend.com','ZZ','GLOBAL-POLICY-1',NULL,'policy','safeguards','approved','1'),
('stripe','Stripe Billing','payment','https://api.stripe.com','ZZ','GLOBAL-POLICY-1',NULL,'policy','safeguards','approved','1');
INSERT OR IGNORE INTO external_provider_policies(provider_code,company_id,country_code,purpose_code,classification,allowed_data_fields,retention_policy_code,transfer_policy,authorization_scope,audit_required,minimize,version) VALUES
('in_app',NULL,'DE','operational_communications','INTERNAL','["notification_type","title","body","recipient_role","mission_id"]','DE_COMMUNICATIONS_DEFAULT','same_jurisdiction','notification_delivery',1,1,'1'),
('r2_primary',NULL,'DE','mission_execution','CONFIDENTIAL','["file_bytes","content_type","mission_id","company_id","evidence_type","integrity_hash"]','DE_MISSION_DEFAULT','same_jurisdiction','mission_file_storage',1,1,'1'),
('resend',NULL,'ZZ','account_management','PERSONAL','["recipient_email","message_type","verification_code_or_reset_link"]','DE_ACCOUNT_DEFAULT','safeguards','transactional_email',1,1,'1'),
('stripe',NULL,'ZZ','billing','CONFIDENTIAL','["company_id","customer_id","plan_id","billing_return_url"]',NULL,'safeguards','billing_provider',1,1,'1');
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('external_provider_registry','contract_status','INTERNAL','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1'),
('external_provider_policies','allowed_data_fields','INTERNAL','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1'),
('external_provider_audit_events','metadata','INTERNAL','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1');
