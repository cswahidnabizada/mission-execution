-- 16.109: shared simulation scenario catalogue; execution remains in the existing isolated Simulation Lab.
CREATE TABLE IF NOT EXISTS platform_simulation_scenarios (
  scenario_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  market_code TEXT,
  sector_code TEXT,
  capability_code TEXT,
  scenario_version TEXT NOT NULL DEFAULT '1.0.0',
  risk_class TEXT NOT NULL CHECK(risk_class IN ('low','moderate','high','critical')),
  scenario_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(capability_code) REFERENCES platform_capabilities(capability_code)
);
ALTER TABLE platform_simulation_runs ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'client_model_unverified' CHECK(verification_status IN ('client_model_unverified','runtime_verified'));
CREATE TABLE IF NOT EXISTS platform_simulation_evidence_links (
  run_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  capability_code TEXT NOT NULL,
  country_code TEXT,
  sector_code TEXT,
  linked_by_identity_id INTEGER NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'model_only' CHECK(verification_status IN ('model_only','runtime_verified')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(run_id,scenario_id,capability_code),
  FOREIGN KEY(run_id) REFERENCES platform_simulation_runs(run_id) ON DELETE RESTRICT,
  FOREIGN KEY(scenario_id) REFERENCES platform_simulation_scenarios(scenario_id),
  FOREIGN KEY(capability_code) REFERENCES platform_capabilities(capability_code)
);
CREATE TRIGGER IF NOT EXISTS trg_simulation_evidence_links_no_update BEFORE UPDATE ON platform_simulation_evidence_links BEGIN SELECT RAISE(ABORT,'SIMULATION_EVIDENCE_LINKS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_simulation_evidence_links_no_delete BEFORE DELETE ON platform_simulation_evidence_links BEGIN SELECT RAISE(ABORT,'SIMULATION_EVIDENCE_LINKS_IMMUTABLE'); END;
INSERT OR IGNORE INTO platform_simulation_scenarios(scenario_id,label,description,market_code,sector_code,capability_code,risk_class,scenario_json) VALUES
('daftar-shop-day','Afghanistan shop day','Receive stock, record a cash sale and reconcile the remaining stock.','AF','trade','digital-daftar','high','{"simulationOnly":true,"externalSideEffects":false,"checks":["stock_increase","sale_posting","stock_decrease","balanced_journal"]}'),
('daftar-qarz-cycle','Qarz lifecycle','Create a credit sale, record a partial settlement and verify the remaining receivable.','AF','trade','daftar-credit','high','{"simulationOnly":true,"externalSideEffects":false,"checks":["receivable_created","partial_settlement","remaining_balance"]}'),
('daftar-offline-replay','Offline sync replay','Capture offline entries and replay the same idempotency key without duplicate effects.','AF','retail','daftar-offline','high','{"simulationOnly":true,"externalSideEffects":false,"checks":["identity_scope","idempotency","queue_sync"]}'),
('daftar-consent-withdrawal','Telemetry consent withdrawal','Withdraw consent and verify contributor observations are excluded from subsequent aggregation.','AF','trade','public-market-data','critical','{"simulationOnly":true,"externalSideEffects":false,"checks":["consent_withdrawn","contributor_removed","index_invalidated"]}'),
('daftar-cohort-privacy','Insufficient public cohort','Verify that a price indicator is withheld below the configured minimum cohort.','AF','trade','public-market-data','critical','{"simulationOnly":true,"externalSideEffects":false,"checks":["cohort_below_threshold","public_result_hidden"]}'),
('daftar-tenant-isolation','Daftar tenant isolation','Attempt cross-tenant ledger and evidence access; all attempts must be denied.','AF','trade','digital-daftar','critical','{"simulationOnly":true,"externalSideEffects":false,"checks":["ledger_scope_denied","evidence_scope_denied"]}'),
('daftar-market-inactive','Inactive market write guard','Attempt a Daftar write while country product activation is absent; write must be blocked.','AF','general','digital-daftar','critical','{"simulationOnly":true,"externalSideEffects":false,"checks":["market_gate_blocked","no_write_effect"]}'),
('de-logistics-regression','Germany Logistics regression','Run a logistics mission through assignment, execution, proof, verification and recovery.','DE','logistics','germany-logistics','critical','{"simulationOnly":true,"externalSideEffects":false,"checks":["mission_journey","assignment","proof","recovery","tenant_isolation"]}');
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('platform_simulation_scenarios','scenario_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_simulation_evidence_links','run_id','CONFIDENTIAL','platform_infrastructure_governance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_simulation_runs','verification_status','INTERNAL','platform_infrastructure_governance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_simulation_evidence_links','verification_status','INTERNAL','platform_infrastructure_governance','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');

INSERT OR IGNORE INTO platform_simulation_scenarios(scenario_id,label,description,market_code,sector_code,capability_code,scenario_version,risk_class,scenario_json,active) VALUES
('de-logistics-provider-unavailable','Germany · Provider unavailable','Regression: executor/provider unavailable before assignment; mission is blocked and replanning is required.','DE','logistics','germany-logistics','1','high','{"expected":"SAFE_BLOCK_AND_REPLAN","simulationOnly":true}',1),
('de-logistics-route-blocked','Germany · Route blocked','Regression: route constraint injected; alternate plan is selected and verified.','DE','logistics','germany-logistics','1','high','{"expected":"REPLAN_AND_VERIFY","simulationOnly":true}',1),
('de-logistics-mission-recovery','Germany · Mission recovery','Regression: simulated delivery effect fails; recovery path is checked without physical action.','DE','logistics','germany-logistics','1','critical','{"expected":"RECOVERY_VERIFIED","simulationOnly":true}',1),
('de-logistics-device-disconnect','Germany · Device disconnect','Regression: virtual device disconnects during execution; safe stop and reconciliation are modeled.','DE','logistics','germany-logistics','1','critical','{"expected":"SAFE_STOP_AND_RECONCILE","simulationOnly":true}',1),
('de-logistics-proof-required','Germany · Proof required','Regression: delivery proof is missing; outcome remains blocked and unverified.','DE','logistics','germany-logistics','1','high','{"expected":"SAFE_BLOCK_AND_REPLAN","simulationOnly":true}',1),
('de-logistics-late-delivery','Germany · Late delivery','Regression: deadline breach triggers modeled escalation; no real notification is sent.','DE','logistics','germany-logistics','1','high','{"expected":"SAFE_BLOCK_AND_REPLAN","simulationOnly":true}',1),
('de-logistics-cancel-before-execution','Germany · Cancel before execution','Regression: authorized cancellation blocks assignment and execution before any effect.','DE','logistics','germany-logistics','1','high','{"expected":"SAFE_BLOCK_AND_REPLAN","simulationOnly":true}',1);
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('platform_simulation_scenarios','scenario_id','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_simulation_scenarios','market_code','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_simulation_scenarios','sector_code','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_simulation_scenarios','capability_code','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('platform_simulation_scenarios','risk_class','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');
