-- ON Mission 10.35.7 — Canonical Backup & Recovery Governance
-- A backup is governed data: classification, purpose, provider, residency,
-- retention, legal hold, restore authorization and reconciliation remain explicit.

INSERT OR IGNORE INTO processing_purposes(code,label,description,default_legal_basis,data_minimization_rule)
VALUES('backup_recovery','Backup and recovery','Protect canonical platform data and restore service state when recovery is required.','legitimate_interests','Back up only governed canonical data required for recoverability; never use backups as an unmanaged data copy.');

INSERT OR IGNORE INTO retention_policies(code,purpose_code,jurisdiction_code,sector_code,retention_days,action_after_expiry,legal_hold_allowed,version)
VALUES('DE_BACKUP_DEFAULT','backup_recovery','DE-GDPR-1','general',35,'delete',1,'1');

INSERT OR IGNORE INTO external_provider_registry(code,name,provider_type,endpoint,country_code,jurisdiction_code,region_code,residency_mode,transfer_mechanism,contract_status,version)
VALUES('d1_managed_backup','ON Mission D1 Managed Backup','storage','D1_MANAGED_BACKUP','DE','DE-GDPR-1','DE','required','same_jurisdiction','approved','1');

INSERT OR IGNORE INTO external_provider_policies(provider_code,company_id,country_code,purpose_code,classification,allowed_data_fields,retention_policy_code,transfer_policy,authorization_scope,audit_required,minimize,version)
VALUES('d1_managed_backup',NULL,'DE','backup_recovery','SECURITY_SENSITIVE','["backup_payload","source_scope","recovery_point_id","integrity_hash"]','DE_BACKUP_DEFAULT','same_jurisdiction','backup_creation|backup_restore',1,1,'1');

CREATE TABLE IF NOT EXISTS backup_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  provider_code TEXT NOT NULL,
  purpose_code TEXT NOT NULL DEFAULT 'backup_recovery',
  classification TEXT NOT NULL CHECK(classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','PERSONAL','HIGHLY_SENSITIVE','SECURITY_SENSITIVE')),
  country_code TEXT NOT NULL DEFAULT 'DE',
  jurisdiction_code TEXT NOT NULL DEFAULT 'DE-GDPR-1',
  region_code TEXT NOT NULL DEFAULT 'DE',
  residency_mode TEXT NOT NULL DEFAULT 'required' CHECK(residency_mode IN ('required','preferred','policy')),
  retention_policy_code TEXT NOT NULL,
  encryption_mode TEXT NOT NULL CHECK(encryption_mode IN ('provider_managed','customer_managed','platform_managed')),
  encryption_status TEXT NOT NULL CHECK(encryption_status IN ('required','configured','verified','failed')),
  legal_hold_propagation TEXT NOT NULL DEFAULT 'required' CHECK(legal_hold_propagation IN ('required','supported','unsupported')),
  restore_authorization_scope TEXT NOT NULL DEFAULT 'backup_restore',
  integrity_verification_required INTEGER NOT NULL DEFAULT 1 CHECK(integrity_verification_required IN (0,1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','blocked','retired')),
  version TEXT NOT NULL DEFAULT '1',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(provider_code) REFERENCES external_provider_registry(code),
  FOREIGN KEY(purpose_code) REFERENCES processing_purposes(code),
  FOREIGN KEY(retention_policy_code) REFERENCES retention_policies(code)
);

CREATE TABLE IF NOT EXISTS backup_recovery_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recovery_point_id TEXT NOT NULL UNIQUE,
  backup_code TEXT NOT NULL,
  company_id INTEGER,
  source_scope TEXT NOT NULL CHECK(source_scope IN ('platform','company')),
  source_data_version TEXT,
  provider_object_ref TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  expires_at TEXT,
  classification TEXT NOT NULL CHECK(classification IN ('PUBLIC','INTERNAL','CONFIDENTIAL','PERSONAL','HIGHLY_SENSITIVE','SECURITY_SENSITIVE')),
  integrity_hash TEXT NOT NULL,
  integrity_status TEXT NOT NULL DEFAULT 'pending' CHECK(integrity_status IN ('pending','verified','failed')),
  encryption_status TEXT NOT NULL DEFAULT 'verified' CHECK(encryption_status IN ('required','configured','verified','failed')),
  residency_region TEXT NOT NULL,
  legal_hold_active INTEGER NOT NULL DEFAULT 0 CHECK(legal_hold_active IN (0,1)),
  deletion_status TEXT NOT NULL DEFAULT 'retained' CHECK(deletion_status IN ('retained','expired','delete_pending','deleted','blocked_legal_hold')),
  size_bytes INTEGER,
  recovery_tested_at TEXT,
  recovery_test_status TEXT CHECK(recovery_test_status IN ('passed','failed','not_tested')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(backup_code) REFERENCES backup_registry(code),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_backup_recovery_points_scope ON backup_recovery_points(backup_code,company_id,captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_recovery_points_expiry ON backup_recovery_points(expires_at,deletion_status);

CREATE TABLE IF NOT EXISTS backup_restore_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  recovery_point_id TEXT NOT NULL,
  backup_code TEXT NOT NULL,
  company_id INTEGER,
  requested_by_role TEXT NOT NULL,
  requested_by_id INTEGER,
  target_scope TEXT NOT NULL CHECK(target_scope IN ('platform','company')),
  reason TEXT NOT NULL,
  authorization_status TEXT NOT NULL DEFAULT 'pending' CHECK(authorization_status IN ('pending','authorized','blocked','expired')),
  authorization_scope TEXT NOT NULL,
  legal_hold_check TEXT NOT NULL DEFAULT 'pending' CHECK(legal_hold_check IN ('pending','clear','required','blocked')),
  execution_status TEXT NOT NULL DEFAULT 'not_started' CHECK(execution_status IN ('not_started','ready','executing','succeeded','failed','cancelled')),
  provider_execution_ref TEXT,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  authorized_at TEXT,
  executed_at TEXT,
  completed_at TEXT,
  error_code TEXT,
  FOREIGN KEY(recovery_point_id) REFERENCES backup_recovery_points(id),
  FOREIGN KEY(backup_code) REFERENCES backup_registry(code),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_backup_restore_requests_status ON backup_restore_requests(execution_status,authorization_status,requested_at DESC);

CREATE TABLE IF NOT EXISTS backup_reconciliation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  recovery_point_id INTEGER NOT NULL,
  company_id INTEGER,
  source_entity_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  source_state TEXT NOT NULL,
  backup_state TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('aligned','pending','blocked','reconciled')),
  legal_hold_active INTEGER NOT NULL DEFAULT 0 CHECK(legal_hold_active IN (0,1)),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(recovery_point_id) REFERENCES backup_recovery_points(id),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_backup_reconciliation_scope ON backup_reconciliation_events(company_id,recovery_point_id,created_at DESC);

INSERT OR IGNORE INTO backup_registry(code,name,provider_code,classification,country_code,jurisdiction_code,region_code,residency_mode,retention_policy_code,encryption_mode,encryption_status,legal_hold_propagation,restore_authorization_scope,integrity_verification_required,status,version)
VALUES('primary_canonical','Primary Canonical Backup','d1_managed_backup','SECURITY_SENSITIVE','DE','DE-GDPR-1','DE','required','DE_BACKUP_DEFAULT','platform_managed','verified','required','backup_restore',1,'active','1');

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('backup_registry','provider_code','INTERNAL','backup_recovery','DE_BACKUP_DEFAULT',0,1,'DE-GDPR-1'),
('backup_registry','retention_policy_code','INTERNAL','backup_recovery','DE_BACKUP_DEFAULT',0,1,'DE-GDPR-1'),
('backup_registry','encryption_status','SECURITY_SENSITIVE','backup_recovery','DE_BACKUP_DEFAULT',0,1,'DE-GDPR-1'),
('backup_recovery_points','provider_object_ref','SECURITY_SENSITIVE','backup_recovery','DE_BACKUP_DEFAULT',0,1,'DE-GDPR-1'),
('backup_recovery_points','integrity_hash','SECURITY_SENSITIVE','backup_recovery','DE_BACKUP_DEFAULT',0,1,'DE-GDPR-1'),
('backup_restore_requests','reason','CONFIDENTIAL','backup_recovery','DE_BACKUP_DEFAULT',0,1,'DE-GDPR-1'),
('backup_restore_requests','provider_execution_ref','SECURITY_SENSITIVE','backup_recovery','DE_BACKUP_DEFAULT',0,1,'DE-GDPR-1'),
('backup_reconciliation_events','notes','CONFIDENTIAL','backup_recovery','DE_BACKUP_DEFAULT',0,1,'DE-GDPR-1');
