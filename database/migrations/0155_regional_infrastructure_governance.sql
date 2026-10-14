-- ON Mission 16.10.0 — regional infrastructure governance.
-- Registry and roadmap are governance projections, not mission/tenant truth or provider control APIs.
CREATE TABLE IF NOT EXISTS platform_region_placements (
  region_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  market_code TEXT NOT NULL,
  jurisdiction_code TEXT NOT NULL,
  provider_code TEXT NOT NULL DEFAULT 'cloudflare',
  environment_scope TEXT NOT NULL DEFAULT 'production' CHECK(environment_scope IN ('development','production','shared')),
  resource_set_id TEXT,
  status TEXT NOT NULL DEFAULT 'PROPOSED' CHECK(status IN ('PROPOSED','BLOCKED','READY_FOR_REVIEW','ACTIVE','RETIRED')),
  activation_allowed INTEGER NOT NULL DEFAULT 0 CHECK(activation_allowed IN (0,1)),
  policy_version TEXT NOT NULL DEFAULT 'regional-placement-v1',
  readiness_json TEXT NOT NULL DEFAULT '{}',
  evidence_json TEXT NOT NULL DEFAULT '[]',
  created_by TEXT,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(status != 'ACTIVE' OR activation_allowed = 1)
);
CREATE INDEX IF NOT EXISTS idx_platform_region_placements_status ON platform_region_placements(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_region_placements_market ON platform_region_placements(market_code, jurisdiction_code);
CREATE TABLE IF NOT EXISTS platform_infrastructure_roadmap (
  task_key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  workstream TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK(status IN ('NOT_STARTED','IN_PROGRESS','BLOCKED','VERIFIED')),
  priority TEXT NOT NULL DEFAULT 'HIGH' CHECK(priority IN ('CRITICAL','HIGH','MEDIUM','LOW')),
  depends_on_json TEXT NOT NULL DEFAULT '[]',
  evidence_text TEXT,
  owner_label TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_platform_infrastructure_roadmap_status ON platform_infrastructure_roadmap(status, priority, task_key);
INSERT OR IGNORE INTO platform_region_placements(region_key,display_name,market_code,jurisdiction_code,provider_code,environment_scope,status,activation_allowed,policy_version,readiness_json,evidence_json)
VALUES('eu-germany','EU Data Plane · Germany Market','DE','EU','cloudflare','production','PROPOSED',0,'regional-placement-v1','{"infrastructure":"UNVERIFIED","residency":"REQUIRES_EVIDENCE","security":"REQUIRES_EVIDENCE","recovery":"REQUIRES_EVIDENCE"}','[]');
INSERT OR IGNORE INTO platform_infrastructure_roadmap(task_key,title,workstream,description,status,priority,depends_on_json,owner_label) VALUES
('dev-isolation','Prove Development isolation','ENVIRONMENTS','Verify independent Worker, D1, KV/R2 bindings, credentials, data and deployment destination.','IN_PROGRESS','CRITICAL','[]','Platform Engineering'),
('prod-eu-d1','Verify EU production data plane','REGIONAL_INFRASTRUCTURE','Confirm the production D1 database was created with EU jurisdiction and production bindings point only to approved resources.','NOT_STARTED','CRITICAL','["dev-isolation"]','Platform Engineering'),
('prod-release-pipeline','Protect production release pipeline','DELIVERY','Require Node 24 build, release gates, migration preflight, protected approval and deployed-runtime certification.','IN_PROGRESS','CRITICAL','["dev-isolation"]','Release Engineering'),
('backup-restore','Prove backup and restore','RESILIENCE','Capture backup configuration and evidence of a successful isolated restore test; configuration alone is insufficient.','NOT_STARTED','HIGH','["prod-eu-d1"]','Operations'),
('security-residency','Validate residency and processing boundaries','COMPLIANCE','Review subprocessors, access paths, logs, retention, deletion, backups and cross-border processing for the intended market.','NOT_STARTED','CRITICAL','["prod-eu-d1"]','Security & Privacy'),
('germany-market','Certify Germany market package','MARKET_FACTORY','Validate Germany logistics package, legal/product policies, resource eligibility and end-to-end customer mission journey.','NOT_STARTED','HIGH','["security-residency","backup-restore"]','Product & Operations'),
('regional-activation','Authorize regional activation','GOVERNANCE','Permit activation only after all critical dependencies have verified evidence and independent approval.','BLOCKED','CRITICAL','["prod-eu-d1","backup-restore","security-residency","germany-market"]','Platform Governance');
INSERT OR IGNORE INTO processing_purposes(code,label,description,default_legal_basis,data_minimization_rule) VALUES('platform_infrastructure_governance','Infrastructure governance','Manage platform infrastructure inventory, regional placement proposals, roadmap readiness and verification evidence.','legitimate_interests','Store only resource governance metadata and evidence necessary for security and release decisions.');
INSERT OR IGNORE INTO retention_policies(code,purpose_code,jurisdiction_code,sector_code,retention_days,action_after_expiry,legal_hold_allowed,version) VALUES('DE_PLATFORM_INFRA_GOVERNANCE','platform_infrastructure_governance','DE-GDPR-1','general',365,'review',1,'1');
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('platform_region_placements','readiness_json','INTERNAL','platform_infrastructure_governance','DE_PLATFORM_INFRA_GOVERNANCE',0,1,'DE-GDPR-1'),
('platform_region_placements','evidence_json','CONFIDENTIAL','platform_infrastructure_governance','DE_PLATFORM_INFRA_GOVERNANCE',0,1,'DE-GDPR-1'),
('platform_infrastructure_roadmap','evidence_text','CONFIDENTIAL','platform_infrastructure_governance','DE_PLATFORM_INFRA_GOVERNANCE',0,1,'DE-GDPR-1');
