-- 16.113: publication contracts, provenance and quality-run history for public market data.
CREATE TABLE IF NOT EXISTS public_data_publications (
  publication_id TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  publication_version TEXT NOT NULL DEFAULT '1.0.0',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','published','suspended','retired')),
  minimum_cohort_size INTEGER NOT NULL DEFAULT 5 CHECK(minimum_cohort_size BETWEEN 5 AND 1000),
  maximum_age_minutes INTEGER NOT NULL DEFAULT 20 CHECK(maximum_age_minutes BETWEEN 1 AND 1440),
  allowed_indicators_json TEXT NOT NULL DEFAULT '["median_unit_price"]',
  public_api_enabled INTEGER NOT NULL DEFAULT 0 CHECK(public_api_enabled IN (0,1)),
  approval_reference TEXT,
  approval_evidence_file_id INTEGER,
  approved_by_identity_id INTEGER,
  approved_at TEXT,
  published_by_identity_id INTEGER,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(country_code,sector_code,publication_version),
  FOREIGN KEY(country_code) REFERENCES country_catalog(code),
  FOREIGN KEY(approval_evidence_file_id) REFERENCES mission_files(id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS public_data_quality_runs (
  quality_run_id TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  publication_id TEXT,
  run_status TEXT NOT NULL CHECK(run_status IN ('pass','partial','blocked','failed')),
  input_count INTEGER NOT NULL DEFAULT 0,
  qualified_index_count INTEGER NOT NULL DEFAULT 0,
  qualified_contributor_count INTEGER NOT NULL DEFAULT 0,
  suppressed_index_count INTEGER NOT NULL DEFAULT 0,
  stale_index_count INTEGER NOT NULL DEFAULT 0,
  checks_json TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code),
  FOREIGN KEY(publication_id) REFERENCES public_data_publications(publication_id)
);
CREATE INDEX IF NOT EXISTS idx_public_data_quality_scope ON public_data_quality_runs(country_code,sector_code,generated_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_public_data_quality_runs_no_update BEFORE UPDATE ON public_data_quality_runs BEGIN SELECT RAISE(ABORT,'PUBLIC_DATA_QUALITY_RUNS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_public_data_quality_runs_no_delete BEFORE DELETE ON public_data_quality_runs BEGIN SELECT RAISE(ABORT,'PUBLIC_DATA_QUALITY_RUNS_IMMUTABLE'); END;
CREATE TABLE IF NOT EXISTS public_data_api_access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publication_id TEXT NOT NULL,
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  returned_indicator_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(publication_id) REFERENCES public_data_publications(publication_id)
);
CREATE INDEX IF NOT EXISTS idx_public_data_api_access_date ON public_data_api_access_log(publication_id,created_at DESC);

INSERT OR IGNORE INTO public_data_publications(publication_id,country_code,sector_code,publication_version,status,minimum_cohort_size,maximum_age_minutes,allowed_indicators_json,public_api_enabled)
VALUES
('11111111-1111-4111-8111-111111111101','AF','trade','1.0.0','draft',5,20,'["median_unit_price"]',0),
('11111111-1111-4111-8111-111111111102','AF','retail','1.0.0','draft',5,20,'["median_unit_price"]',0),
('11111111-1111-4111-8111-111111111103','DE','logistics','1.0.0','draft',5,20,'["median_unit_price"]',0),
('11111111-1111-4111-8111-111111111104','AF','fx','1.0.0','draft',5,60,'["approved_fx_reference"]',0);
INSERT OR IGNORE INTO processing_purposes(code,label,description,default_legal_basis,data_minimization_rule)
VALUES('public_market_data_publication','Public market data publication','Publish cohort-protected aggregate indicators under an approved country/sector publication contract.','consent','Return only aggregate indicators after current market activation, cohort, freshness and quality gates; never expose tenant identifiers or raw observations.');
INSERT OR IGNORE INTO retention_policies(code,purpose_code,jurisdiction_code,sector_code,retention_days,action_after_expiry,legal_hold_allowed,version)
VALUES('PUBLIC_DATA_API_ACCESS_90D','public_market_data_publication','DE-GDPR-1','general',90,'delete',0,'1');
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('public_data_publications','approval_reference','INTERNAL','public_market_data_publication','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('public_data_publications','approval_evidence_file_id','CONFIDENTIAL','public_market_data_publication','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('public_data_quality_runs','checks_json','INTERNAL','public_market_data_publication','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('public_data_api_access_log','publication_id','PUBLIC','public_market_data_publication','PUBLIC_DATA_API_ACCESS_90D',0,0,'DE-GDPR-1');
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('public_data_publications','allowed_indicators_json','INTERNAL','public_market_data_publication','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('public_data_publications','minimum_cohort_size','INTERNAL','public_market_data_publication','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('public_data_publications','maximum_age_minutes','INTERNAL','public_market_data_publication','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('public_data_publications','status','INTERNAL','public_market_data_publication','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('public_data_quality_runs','qualified_contributor_count','INTERNAL','public_market_data_publication','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('public_data_quality_runs','run_status','INTERNAL','public_market_data_publication','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');
