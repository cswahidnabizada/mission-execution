-- ON Mission 10.35.4 — Canonical Notification Data Governance.
CREATE TABLE IF NOT EXISTS notification_policy_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_type TEXT NOT NULL,
  company_id INTEGER,
  country_code TEXT NOT NULL DEFAULT 'ZZ',
  purpose_code TEXT NOT NULL,
  classification TEXT NOT NULL CHECK(classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','PERSONAL','HIGHLY_SENSITIVE','SECURITY_SENSITIVE')),
  provider_code TEXT NOT NULL DEFAULT 'in_app',
  retention_policy_code TEXT,
  allowed_recipient_roles TEXT NOT NULL DEFAULT '["admin","driver","executor"]',
  max_title_length INTEGER NOT NULL DEFAULT 160 CHECK(max_title_length BETWEEN 40 AND 240),
  max_body_length INTEGER NOT NULL DEFAULT 600 CHECK(max_body_length BETWEEN 80 AND 2000),
  minimize INTEGER NOT NULL DEFAULT 1 CHECK(minimize IN (0,1)),
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
CREATE INDEX IF NOT EXISTS idx_notification_policy_scope ON notification_policy_registry(notification_type,company_id,country_code,active,effective_at DESC);

ALTER TABLE notifications ADD COLUMN controller_company_id INTEGER;
ALTER TABLE notifications ADD COLUMN country_code TEXT NOT NULL DEFAULT 'DE';
ALTER TABLE notifications ADD COLUMN purpose_code TEXT NOT NULL DEFAULT 'operational_communications';
ALTER TABLE notifications ADD COLUMN data_classification TEXT NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE notifications ADD COLUMN retention_policy_code TEXT;
ALTER TABLE notifications ADD COLUMN provider_code TEXT NOT NULL DEFAULT 'in_app';
ALTER TABLE notifications ADD COLUMN governance_policy_id INTEGER;
ALTER TABLE notifications ADD COLUMN governance_version TEXT NOT NULL DEFAULT '1';
ALTER TABLE notifications ADD COLUMN governance_minimized INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notifications ADD COLUMN governance_audit_required INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notifications ADD COLUMN legal_hold_active INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN disposed_at TEXT;
ALTER TABLE notifications ADD COLUMN audited_at TEXT;

CREATE INDEX IF NOT EXISTS idx_notifications_controller ON notifications(controller_company_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_governance ON notifications(data_classification,purpose_code,provider_code,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_retention ON notifications(retention_policy_code,legal_hold_active,disposed_at,created_at);

INSERT OR IGNORE INTO notification_policy_registry
(notification_type,company_id,country_code,purpose_code,classification,provider_code,retention_policy_code,allowed_recipient_roles,max_title_length,max_body_length,minimize,audit_required,version)
VALUES
('mission_assigned',NULL,'DE','mission_execution','INTERNAL','in_app','DE_MISSION_DEFAULT','["admin","driver","executor"]',160,600,1,1,'1'),
('mission_updated',NULL,'DE','mission_execution','INTERNAL','in_app','DE_MISSION_DEFAULT','["admin","driver","executor"]',160,600,1,1,'1'),
('mission_status',NULL,'DE','mission_execution','INTERNAL','in_app','DE_MISSION_DEFAULT','["admin","driver","executor"]',160,600,1,1,'1'),
('mission_exception',NULL,'DE','mission_execution','CONFIDENTIAL','in_app','DE_MISSION_DEFAULT','["admin"]',160,600,1,1,'1'),
('deadline_soon',NULL,'DE','mission_execution','INTERNAL','in_app','DE_COMMUNICATIONS_DEFAULT','["admin","driver","executor"]',160,600,1,1,'1'),
('tenant_message',NULL,'DE','operational_communications','CONFIDENTIAL','in_app','DE_COMMUNICATIONS_DEFAULT','["admin","driver","executor"]',160,600,1,1,'1'),
('direct_tenant_message',NULL,'DE','operational_communications','CONFIDENTIAL','in_app','DE_COMMUNICATIONS_DEFAULT','["admin","driver","executor"]',160,600,1,1,'1'),
('participant_message',NULL,'DE','operational_communications','CONFIDENTIAL','in_app','DE_COMMUNICATIONS_DEFAULT','["admin","driver","executor"]',160,600,1,1,'1');

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('notifications','title','INTERNAL','operational_communications','DE_COMMUNICATIONS_DEFAULT',0,1,'DE-GDPR-1'),
('notifications','body','CONFIDENTIAL','operational_communications','DE_COMMUNICATIONS_DEFAULT',0,1,'DE-GDPR-1'),
('notifications','link','INTERNAL','operational_communications','DE_COMMUNICATIONS_DEFAULT',0,1,'DE-GDPR-1'),
('notifications','controller_company_id','INTERNAL','operational_communications','DE_COMMUNICATIONS_DEFAULT',0,1,'DE-GDPR-1'),
('notifications','data_classification','INTERNAL','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1'),
('notifications','purpose_code','INTERNAL','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1'),
('notifications','provider_code','INTERNAL','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1'),
('notifications','governance_policy_id','INTERNAL','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1');
