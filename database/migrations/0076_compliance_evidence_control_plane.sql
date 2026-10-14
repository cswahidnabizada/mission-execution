-- ON Mission 10.35.8 — Canonical Compliance Evidence / Control Plane Completion
-- Durable governance evidence contains control metadata, not tenant payloads.

CREATE TABLE IF NOT EXISTS compliance_evidence_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evidence_id TEXT NOT NULL UNIQUE,
  evidence_type TEXT NOT NULL CHECK(evidence_type IN ('policy','consent','privacy_request','retention','legal_hold','file_governance','provider_governance','residency','backup_recovery','critical_audit','administrative_history','company_compliance')),
  control_code TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT,
  company_id INTEGER,
  country_code TEXT,
  jurisdiction_code TEXT,
  source_table TEXT NOT NULL,
  source_record_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('observed','satisfied','attention','blocked','expired')),
  observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(control_code,subject_type,subject_id,source_table,source_record_id),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_compliance_evidence_control ON compliance_evidence_registry(control_code,status,observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_evidence_company ON compliance_evidence_registry(company_id,observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_evidence_type ON compliance_evidence_registry(evidence_type,status,observed_at DESC);

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('compliance_evidence_registry','metadata','SECURITY_SENSITIVE','security_audit','DE_PRIVACY_REQUESTS',0,1,'DE-GDPR-1'),
('compliance_evidence_registry','source_record_id','INTERNAL','security_audit','DE_PRIVACY_REQUESTS',0,1,'DE-GDPR-1'),
('compliance_evidence_registry','subject_id','INTERNAL','security_audit','DE_PRIVACY_REQUESTS',0,1,'DE-GDPR-1');
