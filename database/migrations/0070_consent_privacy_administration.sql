-- ON Mission 10.35.2 — Canonical Consent & Privacy Administration / Enforcement
-- D1 only. Consent policy is configured by the Admin Control Plane and resolved
-- through canonical Company Context at runtime. This is configuration, not legal advice.

CREATE TABLE IF NOT EXISTS consent_policy_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  country_code TEXT NOT NULL DEFAULT 'ZZ',
  purpose_code TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  title TEXT NOT NULL,
  policy_text TEXT NOT NULL,
  require_consent INTEGER NOT NULL DEFAULT 0 CHECK(require_consent IN (0,1)),
  withdrawal_effect TEXT NOT NULL DEFAULT 'restrict_future_processing' CHECK(withdrawal_effect IN ('restrict_future_processing','review','none')),
  effective_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  superseded_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_by_role TEXT NOT NULL DEFAULT 'platform_administrator',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code),
  FOREIGN KEY(purpose_code) REFERENCES processing_purposes(code)
);

CREATE INDEX IF NOT EXISTS idx_consent_policy_scope
  ON consent_policy_versions(company_id,country_code,purpose_code,active,effective_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_policy_purpose
  ON consent_policy_versions(purpose_code,country_code,active,effective_at DESC);

CREATE TABLE IF NOT EXISTS consent_policy_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  policy_id INTEGER,
  company_id INTEGER,
  purpose_code TEXT,
  request_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_consent_policy_audit_created
  ON consent_policy_audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_policy_audit_company
  ON consent_policy_audit_events(company_id,created_at DESC);

-- Seed a non-mandatory baseline for existing purposes. The policy is explicit so
-- runtime resolution never needs to invent a consent requirement.
INSERT OR IGNORE INTO consent_policy_versions
  (company_id,country_code,purpose_code,policy_version,title,policy_text,require_consent,withdrawal_effect,created_by_role)
SELECT NULL,'ZZ',p.code,'1',
       'Default consent gate — ' || p.label,
       'No additional consent gate is configured for this purpose. Runtime processing remains governed by the canonical purpose, legal-basis, authorization, retention and jurisdiction policies.',
       0,'none','system'
FROM processing_purposes p
WHERE p.active=1;

INSERT OR IGNORE INTO data_classification_registry
  (table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('consent_policy_versions','policy_text','CONFIDENTIAL','account_management','DE_ACCOUNT_DEFAULT',0,1,'DE-GDPR-1'),
('consent_policy_versions','title','INTERNAL','account_management','DE_ACCOUNT_DEFAULT',0,1,'DE-GDPR-1'),
('consent_policy_audit_events','metadata','SECURITY_SENSITIVE','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1');
