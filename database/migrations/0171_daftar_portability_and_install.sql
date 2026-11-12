-- 16.111: user data portability audit and validated restore preview records.
CREATE TABLE IF NOT EXISTS daftar_restore_previews (
  preview_id TEXT PRIMARY KEY,
  company_id INTEGER NOT NULL,
  actor_identity_id INTEGER NOT NULL,
  backup_version TEXT NOT NULL,
  source_country_code TEXT NOT NULL,
  source_sector_code TEXT NOT NULL,
  record_count INTEGER NOT NULL CHECK(record_count>=0),
  content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
  validation_status TEXT NOT NULL CHECK(validation_status IN ('valid','blocked','incompatible')),
  validation_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_daftar_restore_previews_company ON daftar_restore_previews(company_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_daftar_restore_previews_no_update BEFORE UPDATE ON daftar_restore_previews BEGIN SELECT RAISE(ABORT,'DAFTAR_RESTORE_PREVIEWS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_daftar_restore_previews_no_delete BEFORE DELETE ON daftar_restore_previews BEGIN SELECT RAISE(ABORT,'DAFTAR_RESTORE_PREVIEWS_IMMUTABLE'); END;
INSERT OR IGNORE INTO processing_purposes(code,label,description,default_legal_basis,data_minimization_rule)
VALUES('daftar_portability_export','Digital Daftar data portability','Allow an authorized organization owner or administrator to export their private records and validate backup packages.','contract','Exports are organization-scoped, rate-limited, audited and never public; restore preview performs no production mutation.');
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('daftar_restore_previews','company_id','CONFIDENTIAL','daftar_portability_export','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('daftar_restore_previews','validation_json','CONFIDENTIAL','daftar_portability_export','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('daftar_export_audit','content_sha256','SECURITY_SENSITIVE','daftar_portability_export','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');
