-- ON Mission 11.17.0 — Customer Pilot Governance
-- Pilot configuration is a deployment/operational safety boundary. It never owns mission truth,
-- authorization, lifecycle state, assignment truth, or provider truth.

CREATE TABLE agent_customer_pilot_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pilot_id TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','READY','ACTIVE','PAUSED','CLOSED')),
  operating_mode TEXT NOT NULL DEFAULT 'RECOMMEND_ONLY' CHECK(operating_mode IN ('OBSERVE','RECOMMEND_ONLY','PREPARE_ONLY','CONTROLLED_EXECUTION')),
  approved_action_codes_json TEXT NOT NULL DEFAULT '[]',
  required_provider_codes_json TEXT NOT NULL DEFAULT '[]',
  operator_roles_json TEXT NOT NULL DEFAULT '["admin"]',
  readiness_version TEXT NOT NULL DEFAULT '11.17.0',
  start_at TEXT,
  end_at TEXT,
  kill_switch_reason TEXT,
  created_by_role TEXT,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_agent_pilot_company_scope ON agent_customer_pilot_profiles(company_id,country_code,sector_code,status);
CREATE INDEX idx_agent_pilot_status ON agent_customer_pilot_profiles(status,updated_at DESC);

CREATE TABLE agent_pilot_readiness_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pilot_id TEXT NOT NULL,
  check_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PASS','WARN','BLOCKED')),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  evaluated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(pilot_id) REFERENCES agent_customer_pilot_profiles(pilot_id) ON DELETE CASCADE,
  UNIQUE(pilot_id,check_code)
);
CREATE INDEX idx_agent_pilot_readiness ON agent_pilot_readiness_checks(pilot_id,status,evaluated_at DESC);

CREATE TABLE agent_pilot_mission_enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pilot_id TEXT NOT NULL,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ENROLLED' CHECK(status IN ('ENROLLED','ACTIVE','PAUSED','COMPLETED','REMOVED')),
  action_allowlist_json TEXT NOT NULL DEFAULT '[]',
  operator_required INTEGER NOT NULL DEFAULT 1 CHECK(operator_required IN (0,1)),
  enrolled_by_role TEXT,
  enrolled_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(pilot_id) REFERENCES agent_customer_pilot_profiles(pilot_id) ON DELETE CASCADE,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(pilot_id,mission_id)
);
CREATE INDEX idx_agent_pilot_mission_scope ON agent_pilot_mission_enrollments(company_id,mission_id,status);
CREATE INDEX idx_agent_pilot_mission_status ON agent_pilot_mission_enrollments(pilot_id,status,updated_at DESC);

CREATE TABLE agent_pilot_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  pilot_id TEXT NOT NULL,
  company_id INTEGER NOT NULL,
  mission_id INTEGER,
  action_code TEXT,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  previous_event_hash TEXT,
  event_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(pilot_id) REFERENCES agent_customer_pilot_profiles(pilot_id) ON DELETE CASCADE,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);
CREATE INDEX idx_agent_pilot_events_scope ON agent_pilot_events(pilot_id,created_at DESC);
CREATE INDEX idx_agent_pilot_events_mission ON agent_pilot_events(company_id,mission_id,created_at DESC);

CREATE TRIGGER agent_pilot_events_no_update BEFORE UPDATE ON agent_pilot_events BEGIN SELECT RAISE(ABORT,'AGENT_PILOT_EVENT_UPDATE_FORBIDDEN'); END;
CREATE TRIGGER agent_pilot_events_no_delete BEFORE DELETE ON agent_pilot_events BEGIN SELECT RAISE(ABORT,'AGENT_PILOT_EVENT_DELETE_FORBIDDEN'); END;
CREATE TRIGGER agent_pilot_readiness_no_delete BEFORE DELETE ON agent_pilot_readiness_checks BEGIN SELECT RAISE(ABORT,'AGENT_PILOT_READINESS_DELETE_FORBIDDEN'); END;

-- Germany cleaning reference pack. It is a reusable scenario contract only; canonical mission
-- lifecycle/action services remain authoritative and the pilot layer does not execute it by itself.
INSERT OR IGNORE INTO platform_mission_reference_scenarios
(scenario_code,name,description,country_code,sector_code,lifecycle_definition_id,version,status,mission_contract_json,steps_json,exception_contract_json,verification_contract_json,metadata_json,created_by_type,created_by_id)
SELECT
  'cleaning.service.de',
  'Cleaning Service Operation',
  'Germany-first cleaning reference mission for recurring or one-off service execution. It models arrival/start/work/completion while leaving evidence, authorization and mission truth to canonical services.',
  'DE',
  'cleaning',
  id,
  1,
  'active',
  '{"required":["objective","execution_assignment"],"truthAuthority":"canonical_mission","assignmentAuthority":"canonical_assignment","executionBoundary":"canonical_action_application_service"}',
  '[{"sequence":10,"code":"ASSIGN","actionCode":"assign_driver","fromStates":["Pending"],"toState":"Pending","risk":"HIGH_IMPACT","humanApprovalRequired":true,"verification":"canonical_assignment"},{"sequence":20,"code":"START","actionCode":"start_operation","fromStates":["Pending"],"toState":"InProgress","risk":"LOW_RISK","verification":"canonical_mission_status"},{"sequence":30,"code":"REPORT_EXCEPTION","actionCode":"report_exception","fromStates":["InProgress"],"toState":"InProgress","risk":"LOW_RISK","verification":"canonical_exception"},{"sequence":40,"code":"COMPLETE","actionCode":"complete_operation","fromStates":["InProgress"],"toState":"Completed","risk":"HIGH_IMPACT","humanApprovalRequired":true,"verification":"completion_gate"}]',
  '{"late_executor":{"response":"reassess_assignment_or_escalate"},"site_unavailable":{"response":"report_exception_and_wait_or_replan"},"missing_access":{"response":"report_exception_and_escalate"},"unsafe_condition":{"response":"stop_work_and_escalate_human"},"quality_issue":{"response":"record_exception_and_require_supervised_resolution"},"timeout":{"response":"verify_canonical_state_before_any_retry"},"conflicting_state":{"response":"stop_and_reconcile_canonical_truth"}}',
  '{"assignment":"mission_assignments","start":"mission.status","completion":"completion_gate","exception":"canonical_exception","unknown":"never_assume_success"}',
  '{"scope":"DE/cleaning","referenceOnly":true,"firstLaunch":true,"platformNeutral":true}',
  'system',
  '11.17.0'
FROM platform_lifecycle_definitions
WHERE lifecycle_key='general.default' AND version=1;
