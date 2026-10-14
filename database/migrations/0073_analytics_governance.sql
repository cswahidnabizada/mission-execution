-- ON Mission 10.35.5 — Canonical Analytics Governance.
CREATE TABLE IF NOT EXISTS analytics_policy_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  country_code TEXT NOT NULL DEFAULT 'ZZ',
  purpose_code TEXT NOT NULL DEFAULT 'operational_communications',
  classification TEXT NOT NULL CHECK(classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','PERSONAL','HIGHLY_SENSITIVE','SECURITY_SENSITIVE')),
  retention_policy_code TEXT,
  allowed_metric_codes TEXT NOT NULL DEFAULT '[]',
  aggregation_required INTEGER NOT NULL DEFAULT 1 CHECK(aggregation_required IN (0,1)),
  minimize INTEGER NOT NULL DEFAULT 1 CHECK(minimize IN (0,1)),
  pseudonymize INTEGER NOT NULL DEFAULT 1 CHECK(pseudonymize IN (0,1)),
  export_allowed INTEGER NOT NULL DEFAULT 0 CHECK(export_allowed IN (0,1)),
  audit_required INTEGER NOT NULL DEFAULT 1 CHECK(audit_required IN (0,1)),
  version TEXT NOT NULL DEFAULT '1',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  effective_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code),
  FOREIGN KEY(purpose_code) REFERENCES processing_purposes(code),
  FOREIGN KEY(retention_policy_code) REFERENCES retention_policies(code)
);
CREATE INDEX IF NOT EXISTS idx_analytics_policy_scope ON analytics_policy_registry(company_id,country_code,active,effective_at DESC);

INSERT OR IGNORE INTO analytics_policy_registry
(company_id,country_code,purpose_code,classification,retention_policy_code,allowed_metric_codes,aggregation_required,minimize,pseudonymize,export_allowed,audit_required,version)
VALUES
(NULL,'DE','operational_communications','INTERNAL','DE_COMMUNICATIONS_DEFAULT','["missionVolume","activeMissions","completionRate","overdueRate","averageMissionDurationMinutes","averageStageDurationMinutes","exceptionRate","networkInvitationAcceptanceRate","missionsPerExecutor","foryouAcceptanceRate","statusDistribution","dailyActivity"]',1,1,1,0,1,'1');

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('analytics_policy_registry','allowed_metric_codes','INTERNAL','operational_communications','DE_COMMUNICATIONS_DEFAULT',0,1,'DE-GDPR-1'),
('analytics_policy_registry','classification','INTERNAL','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1'),
('analytics_policy_registry','retention_policy_code','INTERNAL','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1');
