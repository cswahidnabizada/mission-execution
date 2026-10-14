-- ON Mission 10.35.4 — Canonical Data-Subject Rights Workflow.
-- Forward-only. D1 remains the canonical database. No destructive rights engine is introduced.

CREATE TABLE IF NOT EXISTS privacy_request_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  privacy_request_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  actor_identity_id INTEGER,
  note TEXT,
  outcome_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(privacy_request_id) REFERENCES privacy_requests(id) ON DELETE CASCADE
);

ALTER TABLE privacy_requests ADD COLUMN assigned_role TEXT;
ALTER TABLE privacy_requests ADD COLUMN assigned_at TEXT;
ALTER TABLE privacy_requests ADD COLUMN last_reviewed_at TEXT;
ALTER TABLE privacy_requests ADD COLUMN legal_hold_active INTEGER NOT NULL DEFAULT 0;
ALTER TABLE privacy_requests ADD COLUMN response_channel TEXT;

-- Seed the workflow retention policy before registering data-classification rows.
-- data_classification_registry.retention_policy_code is an enforced foreign key.
INSERT OR IGNORE INTO retention_policies(code,purpose_code,jurisdiction_code,sector_code,retention_days,action_after_expiry,legal_hold_allowed,version)
VALUES ('DE_PRIVACY_WORKFLOW','security_audit','DE-GDPR-1','general',1095,'review',1,'1');

CREATE INDEX IF NOT EXISTS idx_privacy_request_events_request ON privacy_request_events(privacy_request_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_workflow ON privacy_requests(status,request_type,requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_privacy_requests_assigned ON privacy_requests(assigned_role,status,requested_at DESC);

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('privacy_requests','response_channel','INTERNAL','security_audit','DE_PRIVACY_WORKFLOW',0,1,'DE-GDPR-1'),
('privacy_requests','assigned_role','INTERNAL','security_audit','DE_PRIVACY_WORKFLOW',0,1,'DE-GDPR-1'),
('privacy_request_events','note','CONFIDENTIAL','security_audit','DE_PRIVACY_WORKFLOW',0,1,'DE-GDPR-1'),
('privacy_request_events','outcome_code','INTERNAL','security_audit','DE_PRIVACY_WORKFLOW',0,1,'DE-GDPR-1');
