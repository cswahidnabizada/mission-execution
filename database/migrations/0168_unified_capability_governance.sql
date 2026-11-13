-- 16.108: canonical capability lifecycle and market bindings.
-- Repair the canonical compliance retention policy referenced by the existing classification registry.
INSERT OR IGNORE INTO retention_policies(code,purpose_code,jurisdiction_code,sector_code,retention_days,action_after_expiry,legal_hold_allowed,version)
VALUES('DE_COMPLIANCE_REVIEW','compliance','DE-GDPR-1','general',1095,'review',1,'1');
-- Registry metadata governs discoverability and certification; domain services retain operational truth.
CREATE TABLE IF NOT EXISTS platform_capabilities (
  capability_code TEXT PRIMARY KEY CHECK(length(capability_code) BETWEEN 3 AND 100),
  label TEXT NOT NULL CHECK(length(label) BETWEEN 2 AND 140),
  description TEXT NOT NULL,
  owner_domain TEXT NOT NULL,
  contract_version TEXT NOT NULL,
  risk_class TEXT NOT NULL CHECK(risk_class IN ('low','moderate','high','critical')),
  lifecycle_status TEXT NOT NULL DEFAULT 'defined' CHECK(lifecycle_status IN ('defined','configured','simulated','certified','published','activated','monitored','suspended','retired')),
  supported_scope_json TEXT NOT NULL DEFAULT '{}',
  dependencies_json TEXT NOT NULL DEFAULT '[]',
  required_evidence_json TEXT NOT NULL DEFAULT '[]',
  canonical_authority TEXT NOT NULL,
  rollback_strategy TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_market_capabilities (
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  capability_code TEXT NOT NULL,
  capability_version TEXT NOT NULL,
  lifecycle_status TEXT NOT NULL DEFAULT 'defined' CHECK(lifecycle_status IN ('defined','configured','simulated','certified','published','activated','monitored','suspended','retired')),
  configuration_json TEXT NOT NULL DEFAULT '{}',
  latest_simulation_run_id TEXT,
  certification_reference TEXT,
  release_reference TEXT,
  updated_by_identity_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(country_code,sector_code,capability_code,capability_version),
  FOREIGN KEY(country_code) REFERENCES country_catalog(code),
  FOREIGN KEY(capability_code) REFERENCES platform_capabilities(capability_code),
  FOREIGN KEY(latest_simulation_run_id) REFERENCES platform_simulation_runs(run_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_platform_market_capabilities_scope ON platform_market_capabilities(country_code,sector_code,lifecycle_status);
CREATE TABLE IF NOT EXISTS platform_capability_lifecycle_events (
  event_id TEXT PRIMARY KEY,
  capability_code TEXT NOT NULL,
  country_code TEXT,
  sector_code TEXT,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_identity_id INTEGER NOT NULL,
  evidence_reference TEXT,
  reason TEXT NOT NULL,
  event_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(capability_code) REFERENCES platform_capabilities(capability_code)
);
CREATE INDEX IF NOT EXISTS idx_capability_events_target ON platform_capability_lifecycle_events(capability_code,country_code,sector_code,created_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_capability_events_no_update BEFORE UPDATE ON platform_capability_lifecycle_events BEGIN SELECT RAISE(ABORT,'CAPABILITY_EVENTS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_capability_events_no_delete BEFORE DELETE ON platform_capability_lifecycle_events BEGIN SELECT RAISE(ABORT,'CAPABILITY_EVENTS_IMMUTABLE'); END;

INSERT OR IGNORE INTO platform_capabilities(capability_code,label,description,owner_domain,contract_version,risk_class,lifecycle_status,supported_scope_json,dependencies_json,required_evidence_json,canonical_authority,rollback_strategy) VALUES
('mission-execution','Mission Execution','Governed planning, authorization, assignment, execution, verification and recovery.','mission','1.0.0','critical','configured','{"markets":["DE","AF"],"sectors":["logistics","trade","retail","general"]}','["identity","tenant","policy","authorization","audit","resource"]','["journey_pass","tenant_isolation","recovery_proof","human_approval"]','Canonical Mission Lifecycle','Suspend new execution while preserving active mission recovery and audit.'),
('germany-logistics','Germany Logistics','Germany market logistics workflows and provider/resource integration.','market-germany-logistics','1.0.0','high','configured','{"countries":["DE"],"sectors":["logistics"]}','["mission-execution","provider-governance","market-launch"]','["market_certification","provider_readiness","mission_proof"]','Germany Market Package + Canonical Mission Services','Keep existing release active; suspend new market activation and preserve in-flight recovery.'),
('digital-daftar','Digital Daftar','Private trade and operational book for market-specific small-business workflows.','daftar','1.0.0','high','configured','{"countries":["AF"],"sectors":["general","trade","retail","logistics","fx","labor"]}','["identity","tenant","country-launch","privacy","audit"]','["tenant_isolation","ledger_integrity","offline_recovery","privacy_review"]','Digital Daftar Domain Service','Block new writes while preserving private read/export and audit rights.'),
('daftar-inventory','Daftar Inventory','Append-only stock movements and guarded balance projections.','daftar-inventory','1.0.0','high','configured','{"countries":["AF"],"sectors":["general","trade","retail"]}','["digital-daftar","unit-governance"]','["stock_reconciliation","negative_stock_rejection"]','Daftar Inventory Movement Ledger','Block new stock movements; retain balances and movement history.'),
('daftar-credit','Daftar Qarz','Private receivables/payables records and bounded settlement workflows.','daftar-credit','1.0.0','high','configured','{"countries":["AF"],"sectors":["general","trade","retail"]}','["digital-daftar","accounting-journal"]','["settlement_reconciliation","overpayment_rejection"]','Daftar Credit Settlement Ledger','Block new settlements; retain existing balances and history.'),
('daftar-accounting-book','Daftar Business Book','Append-only balanced single-currency journal postings for business transactions.','daftar-accounting','1.0.0','critical','defined','{"countries":["AF"],"sectors":["general","trade","retail"]}','["digital-daftar","accounting-journal"]','["balanced_postings","idempotency","reconciliation","reversal_proof"]','Daftar Journal Transaction Ledger','Disable new postings; retain journal read/export and reconciliation.'),
('daftar-offline','Daftar Offline Capture','Encrypted device-local capture queue with identity-scoped synchronization.','daftar-offline','1.0.0','high','configured','{"countries":["AF"],"sectors":["general","trade","retail","logistics","labor"]}','["digital-daftar","identity","device-session"]','["identity_rebind_block","idempotent_sync","queue_recovery"]','Daftar Device Queue + Sync Service','Disable new offline writes only after warning; preserve export and recovery path.'),
('public-market-data','Public Market Data','Cohort-protected, consent-based aggregate market indicators and public read API.','public-market-data','1.0.0','high','configured','{"countries":["AF"],"sectors":["trade","retail","logistics","labor","fx"]}','["digital-daftar","telemetry-consent","market-aggregation"]','["minimum_cohort","freshness","provenance","consent_withdrawal"]','Daftar Telemetry Aggregator + Publication Registry','Unpublish public projections; private ledgers remain unaffected.');

INSERT OR IGNORE INTO platform_market_capabilities(country_code,sector_code,capability_code,capability_version,lifecycle_status,configuration_json)
SELECT 'DE','logistics',capability_code,'1.0.0','configured','{"source":"existing_market_package","activationAuthority":"country_product_launches"}' FROM platform_capabilities WHERE capability_code IN ('mission-execution','germany-logistics');
INSERT OR IGNORE INTO platform_market_capabilities(country_code,sector_code,capability_code,capability_version,lifecycle_status,configuration_json)
SELECT 'AF','general',c.capability_code,'1.0.0','configured','{"source":"daftar_market_profiles","activationAuthority":"country_product_launches"}'
FROM platform_capabilities c WHERE c.capability_code IN ('digital-daftar','daftar-inventory','daftar-credit','daftar-accounting-book','daftar-offline','public-market-data')
AND EXISTS(SELECT 1 FROM daftar_market_profiles p WHERE p.country_code='AF' AND p.sector_code='general');
INSERT OR IGNORE INTO platform_market_capabilities(country_code,sector_code,capability_code,capability_version,lifecycle_status,configuration_json)
SELECT 'AF','trade',c.capability_code,'1.0.0','configured','{"source":"daftar_market_profiles","activationAuthority":"country_product_launches"}'
FROM platform_capabilities c WHERE c.capability_code IN ('digital-daftar','daftar-inventory','daftar-credit','daftar-accounting-book','daftar-offline','public-market-data')
AND EXISTS(SELECT 1 FROM daftar_market_profiles p WHERE p.country_code='AF' AND p.sector_code='trade');
INSERT OR IGNORE INTO platform_market_capabilities(country_code,sector_code,capability_code,capability_version,lifecycle_status,configuration_json)
SELECT 'AF','retail',c.capability_code,'1.0.0','configured','{"source":"daftar_market_profiles","activationAuthority":"country_product_launches"}'
FROM platform_capabilities c WHERE c.capability_code IN ('digital-daftar','daftar-inventory','daftar-credit','daftar-accounting-book','daftar-offline','public-market-data')
AND EXISTS(SELECT 1 FROM daftar_market_profiles p WHERE p.country_code='AF' AND p.sector_code='retail');
INSERT OR IGNORE INTO platform_market_capabilities(country_code,sector_code,capability_code,capability_version,lifecycle_status,configuration_json)
SELECT 'AF','logistics',c.capability_code,'1.0.0','configured','{"source":"daftar_market_profiles","activationAuthority":"country_product_launches"}'
FROM platform_capabilities c WHERE c.capability_code IN ('digital-daftar','daftar-inventory','daftar-credit','daftar-accounting-book','daftar-offline','public-market-data')
AND EXISTS(SELECT 1 FROM daftar_market_profiles p WHERE p.country_code='AF' AND p.sector_code='logistics');
INSERT OR IGNORE INTO platform_market_capabilities(country_code,sector_code,capability_code,capability_version,lifecycle_status,configuration_json)
SELECT 'AF','fx',c.capability_code,'1.0.0','configured','{"source":"daftar_market_profiles","activationAuthority":"country_product_launches"}'
FROM platform_capabilities c WHERE c.capability_code IN ('digital-daftar','daftar-inventory','daftar-credit','daftar-accounting-book','daftar-offline','public-market-data')
AND EXISTS(SELECT 1 FROM daftar_market_profiles p WHERE p.country_code='AF' AND p.sector_code='fx');
INSERT OR IGNORE INTO platform_market_capabilities(country_code,sector_code,capability_code,capability_version,lifecycle_status,configuration_json)
SELECT 'AF','labor',c.capability_code,'1.0.0','configured','{"source":"daftar_market_profiles","activationAuthority":"country_product_launches"}'
FROM platform_capabilities c WHERE c.capability_code IN ('digital-daftar','daftar-inventory','daftar-credit','daftar-accounting-book','daftar-offline','public-market-data')
AND EXISTS(SELECT 1 FROM daftar_market_profiles p WHERE p.country_code='AF' AND p.sector_code='labor');
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('platform_capabilities','dependencies_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_capabilities','required_evidence_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_market_capabilities','configuration_json','CONFIDENTIAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_market_capabilities','certification_reference','CONFIDENTIAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_capability_lifecycle_events','event_json','CONFIDENTIAL','platform_infrastructure_governance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('platform_capabilities','capability_code','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_capabilities','label','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_capabilities','owner_domain','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_capabilities','canonical_authority','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_market_capabilities','lifecycle_status','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_market_capabilities','release_reference','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_market_capabilities','latest_simulation_run_id','CONFIDENTIAL','platform_infrastructure_governance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');
