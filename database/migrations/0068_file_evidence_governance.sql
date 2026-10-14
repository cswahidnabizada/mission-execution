-- ON Mission 10.35.0 — Canonical File & Evidence Governance
-- File metadata is policy-governed in D1; R2 remains the binary object store.

INSERT OR IGNORE INTO processing_purposes(code,label,description,default_legal_basis,data_minimization_rule)
VALUES
('evidence','Evidence','Preserve operational evidence required to establish or verify mission execution and compliance-relevant events.','contract','Store only the evidence necessary to establish the operational event.'),
('identity_verification','Identity verification','Process identity and verification evidence needed to establish authorized platform access.','legal_obligation','Store only verification evidence required by the applicable identity policy.'),
('compliance','Compliance','Process evidence and records needed to operate configured compliance controls and respond to lawful obligations.','legal_obligation','Store only compliance evidence necessary for the configured control.'),
('account_management','Account management','Authentication, account lifecycle and access administration.','contract','Only identity and account data necessary for secure access.');

INSERT OR IGNORE INTO retention_policies(code,purpose_code,jurisdiction_code,sector_code,retention_days,action_after_expiry,legal_hold_allowed,version)
VALUES
('DE_EVIDENCE_REVIEW','evidence','DE-GDPR-1','general',NULL,'review',1,'1'),
('DE_IDENTITY_VERIFICATION','identity_verification','DE-GDPR-1','general',1095,'review',1,'1'),
('DE_COMPLIANCE_REVIEW','compliance','DE-GDPR-1','general',1095,'review',1,'1');

CREATE TABLE IF NOT EXISTS file_classification_catalog (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS file_purpose_catalog (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  processing_purpose_code TEXT NOT NULL,
  default_classification TEXT NOT NULL,
  default_retention_policy_code TEXT NOT NULL,
  access_policy_code TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(processing_purpose_code) REFERENCES processing_purposes(code),
  FOREIGN KEY(default_retention_policy_code) REFERENCES retention_policies(code)
);

CREATE TABLE IF NOT EXISTS file_access_policies (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  minimum_relationship TEXT NOT NULL CHECK(minimum_relationship IN ('mission_participant','mission_owner','compliance_admin')),
  allow_owner INTEGER NOT NULL DEFAULT 1,
  allow_shared_participant INTEGER NOT NULL DEFAULT 1,
  allow_assigned_executor INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO file_classification_catalog(code,label,description)
VALUES
('PUBLIC','Public','Approved for public reference use only. It is never the default for uploaded mission content.'),
('INTERNAL','Internal','Operational information intended for authorized platform use.'),
('CONFIDENTIAL','Confidential','Operational information restricted to authorized mission participants.'),
('PERSONAL','Personal','Contains personal data requiring purpose-limited access.'),
('HIGHLY_SENSITIVE','Highly sensitive','Contains identity or other data requiring heightened access controls.'),
('SECURITY_SENSITIVE','Security sensitive','Contains security, authentication or security-control information.');

INSERT OR IGNORE INTO file_access_policies(code,label,description,minimum_relationship,allow_owner,allow_shared_participant,allow_assigned_executor,version)
VALUES
('MISSION_PARTICIPANT','Mission participant','Accessible only through an authorized mission relationship.','mission_participant',1,1,1,'1'),
('EVIDENCE_PARTICIPANT','Evidence participant','Evidence is accessible only to the authorized mission owner and participants.','mission_participant',1,1,1,'1'),
('COMPLIANCE_ADMIN','Compliance administrator','Restricted to the authorized owning organization administrative context.','compliance_admin',1,0,0,'1');

INSERT OR IGNORE INTO file_purpose_catalog(code,label,processing_purpose_code,default_classification,default_retention_policy_code,access_policy_code)
VALUES
('MISSION_EXECUTION','Mission execution files','mission_execution','CONFIDENTIAL','DE_MISSION_DEFAULT','MISSION_PARTICIPANT'),
('COMMUNICATION','Communication attachment','operational_communications','CONFIDENTIAL','DE_COMMUNICATIONS_DEFAULT','MISSION_PARTICIPANT'),
('IDENTITY_VERIFICATION','Identity verification evidence','identity_verification','HIGHLY_SENSITIVE','DE_IDENTITY_VERIFICATION','COMPLIANCE_ADMIN'),
('COMPLIANCE','Compliance evidence','compliance','CONFIDENTIAL','DE_COMPLIANCE_REVIEW','COMPLIANCE_ADMIN'),
('EVIDENCE','Operational evidence','evidence','CONFIDENTIAL','DE_EVIDENCE_REVIEW','EVIDENCE_PARTICIPANT'),
('ACCOUNT_MANAGEMENT','Account management file','account_management','PERSONAL','DE_ACCOUNT_DEFAULT','COMPLIANCE_ADMIN');

ALTER TABLE mission_files ADD COLUMN classification TEXT NOT NULL DEFAULT 'CONFIDENTIAL' CHECK(classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','PERSONAL','HIGHLY_SENSITIVE','SECURITY_SENSITIVE'));
ALTER TABLE mission_files ADD COLUMN purpose_code TEXT NOT NULL DEFAULT 'MISSION_EXECUTION';
ALTER TABLE mission_files ADD COLUMN evidence_type TEXT NOT NULL DEFAULT 'attachment' CHECK(evidence_type IN ('attachment','evidence','critical_evidence','compliance_evidence'));
ALTER TABLE mission_files ADD COLUMN controller_company_id INTEGER;
ALTER TABLE mission_files ADD COLUMN owner_type TEXT NOT NULL DEFAULT 'company';
ALTER TABLE mission_files ADD COLUMN owner_id INTEGER;
ALTER TABLE mission_files ADD COLUMN created_by_identity_type TEXT;
ALTER TABLE mission_files ADD COLUMN created_by_identity_id INTEGER;
ALTER TABLE mission_files ADD COLUMN access_policy_code TEXT NOT NULL DEFAULT 'MISSION_PARTICIPANT';
ALTER TABLE mission_files ADD COLUMN retention_policy_code TEXT NOT NULL DEFAULT 'DE_MISSION_DEFAULT';
ALTER TABLE mission_files ADD COLUMN retention_policy_version TEXT NOT NULL DEFAULT '1';
ALTER TABLE mission_files ADD COLUMN retention_due_at TEXT;
ALTER TABLE mission_files ADD COLUMN disposition_status TEXT NOT NULL DEFAULT 'active' CHECK(disposition_status IN ('active','restricted','pending_review','disposed'));
ALTER TABLE mission_files ADD COLUMN disposition_reason TEXT;
ALTER TABLE mission_files ADD COLUMN disposed_at TEXT;
ALTER TABLE mission_files ADD COLUMN legal_hold_active INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mission_files ADD COLUMN content_sha256 TEXT;
ALTER TABLE mission_files ADD COLUMN integrity_version TEXT NOT NULL DEFAULT '1';

UPDATE mission_files
SET controller_company_id=company_id,
    owner_id=company_id,
    purpose_code='MISSION_EXECUTION',
    evidence_type=CASE WHEN file_type='photo' THEN 'attachment' ELSE 'attachment' END,
    access_policy_code='MISSION_PARTICIPANT',
    retention_policy_code='DE_MISSION_DEFAULT',
    retention_policy_version='1',
    retention_due_at=NULL
WHERE controller_company_id IS NULL;

UPDATE mission_files
SET purpose_code='EVIDENCE',
    evidence_type='critical_evidence',
    access_policy_code='EVIDENCE_PARTICIPANT',
    retention_policy_code='DE_EVIDENCE_REVIEW',
    retention_policy_version='1'
WHERE id IN (SELECT file_id FROM mission_delivery_proofs);

UPDATE mission_files
SET classification='CONFIDENTIAL'
WHERE classification IS NULL OR classification='';

CREATE INDEX IF NOT EXISTS idx_mission_files_governance ON mission_files(company_id,mission_id,disposition_status,purpose_code,id);
CREATE INDEX IF NOT EXISTS idx_mission_files_retention ON mission_files(retention_policy_code,retention_due_at,legal_hold_active,disposition_status);
CREATE INDEX IF NOT EXISTS idx_mission_files_controller ON mission_files(controller_company_id,owner_type,owner_id);
CREATE INDEX IF NOT EXISTS idx_mission_files_creator ON mission_files(created_by_identity_type,created_by_identity_id);

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('mission_files','classification','INTERNAL','mission_execution','DE_MISSION_DEFAULT',0,1,'DE-GDPR-1'),
('mission_files','purpose_code','INTERNAL','mission_execution','DE_MISSION_DEFAULT',0,1,'DE-GDPR-1'),
('mission_files','evidence_type','CONFIDENTIAL','evidence','DE_EVIDENCE_REVIEW',0,1,'DE-GDPR-1'),
('mission_files','controller_company_id','CONFIDENTIAL','mission_execution','DE_MISSION_DEFAULT',0,1,'DE-GDPR-1'),
('mission_files','owner_id','CONFIDENTIAL','mission_execution','DE_MISSION_DEFAULT',0,1,'DE-GDPR-1'),
('mission_files','created_by_identity_id','PERSONAL','account_management','DE_ACCOUNT_DEFAULT',0,1,'DE-GDPR-1'),
('mission_files','access_policy_code','INTERNAL','mission_execution','DE_MISSION_DEFAULT',0,1,'DE-GDPR-1'),
('mission_files','retention_policy_code','INTERNAL','mission_execution','DE_MISSION_DEFAULT',0,1,'DE-GDPR-1'),
('mission_files','retention_due_at','INTERNAL','mission_execution','DE_MISSION_DEFAULT',0,1,'DE-GDPR-1'),
('mission_files','disposition_reason','CONFIDENTIAL','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1'),
('mission_files','content_sha256','SECURITY_SENSITIVE','security_audit','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1');

-- Mission deletion is no longer allowed to bypass file governance. The mission
-- service must preserve file rows and let the policy-aware disposition service decide.
