-- 16.112: controlled pilot review evidence. This never activates country_product_launches.
CREATE TABLE IF NOT EXISTS daftar_pilot_reviews (
  id TEXT PRIMARY KEY,
  country_code TEXT NOT NULL DEFAULT 'AF',
  sector_code TEXT NOT NULL,
  review_type TEXT NOT NULL CHECK(review_type IN ('legal','operational','merchant_acceptance','security','data_residency','metrology')),
  review_status TEXT NOT NULL CHECK(review_status IN ('pending','in_review','accepted','rejected','waived')),
  reviewer_identity_id INTEGER NOT NULL,
  evidence_reference TEXT NOT NULL CHECK(length(evidence_reference) BETWEEN 8 AND 300),
  evidence_file_id INTEGER,
  evidence_sha256 TEXT CHECK(evidence_sha256 IS NULL OR length(evidence_sha256)=64),
  review_notes TEXT,
  reviewed_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code),
  FOREIGN KEY(evidence_file_id) REFERENCES mission_files(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_daftar_pilot_review_scope ON daftar_pilot_reviews(country_code,sector_code,review_type,review_status,created_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_daftar_pilot_reviews_no_update BEFORE UPDATE ON daftar_pilot_reviews BEGIN SELECT RAISE(ABORT,'DAFTAR_PILOT_REVIEWS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_daftar_pilot_reviews_no_delete BEFORE DELETE ON daftar_pilot_reviews BEGIN SELECT RAISE(ABORT,'DAFTAR_PILOT_REVIEWS_IMMUTABLE'); END;

-- Pilot access is explicitly allowlisted while a market profile remains in pilot state.
CREATE TABLE IF NOT EXISTS daftar_pilot_tenant_access (
  id TEXT PRIMARY KEY,
  company_id INTEGER NOT NULL,
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  access_status TEXT NOT NULL CHECK(access_status IN ('approved','revoked')),
  approved_by_identity_id INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 8 AND 500),
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,country_code,sector_code),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code)
);
CREATE INDEX IF NOT EXISTS idx_daftar_pilot_access_market ON daftar_pilot_tenant_access(country_code,sector_code,access_status,expires_at);
CREATE TABLE IF NOT EXISTS daftar_pilot_access_events (
  event_id TEXT PRIMARY KEY,
  access_id TEXT NOT NULL,
  company_id INTEGER NOT NULL,
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  access_status TEXT NOT NULL CHECK(access_status IN ('approved','revoked')),
  actor_identity_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(access_id) REFERENCES daftar_pilot_tenant_access(id),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_daftar_pilot_access_events_company ON daftar_pilot_access_events(company_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_daftar_pilot_access_events_no_update BEFORE UPDATE ON daftar_pilot_access_events BEGIN SELECT RAISE(ABORT,'DAFTAR_PILOT_ACCESS_EVENTS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_daftar_pilot_access_events_no_delete BEFORE DELETE ON daftar_pilot_access_events BEGIN SELECT RAISE(ABORT,'DAFTAR_PILOT_ACCESS_EVENTS_IMMUTABLE'); END;
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('daftar_pilot_reviews','reviewer_identity_id','HIGHLY_SENSITIVE','compliance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('daftar_pilot_reviews','evidence_reference','CONFIDENTIAL','compliance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('daftar_pilot_reviews','review_notes','CONFIDENTIAL','compliance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('daftar_pilot_tenant_access','company_id','CONFIDENTIAL','daftar_private_ledger','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('daftar_pilot_tenant_access','reason','CONFIDENTIAL','daftar_private_ledger','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('daftar_pilot_access_events','actor_identity_id','HIGHLY_SENSITIVE','compliance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('daftar_pilot_reviews','review_type','INTERNAL','compliance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('daftar_pilot_reviews','review_status','INTERNAL','compliance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('daftar_pilot_reviews','evidence_sha256','SECURITY_SENSITIVE','compliance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('daftar_pilot_tenant_access','access_status','CONFIDENTIAL','daftar_private_ledger','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('daftar_pilot_tenant_access','expires_at','CONFIDENTIAL','daftar_private_ledger','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('daftar_pilot_access_events','reason','CONFIDENTIAL','compliance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');
