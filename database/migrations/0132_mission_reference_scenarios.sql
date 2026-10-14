-- ON Mission 11.14.0 — Reference Mission Scenarios
-- Reference scenarios are reusable product contracts. They do not own mission truth,
-- authorization, lifecycle state, or execution. The canonical mission/lifecycle/action
-- authorities remain authoritative.

CREATE TABLE IF NOT EXISTS platform_mission_reference_scenarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  country_code TEXT,
  sector_code TEXT NOT NULL,
  lifecycle_definition_id INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','validated','active','retired')),
  mission_contract_json TEXT NOT NULL DEFAULT '{}',
  steps_json TEXT NOT NULL DEFAULT '[]',
  exception_contract_json TEXT NOT NULL DEFAULT '{}',
  verification_contract_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(scenario_code,version),
  FOREIGN KEY(country_code) REFERENCES country_catalog(code),
  FOREIGN KEY(lifecycle_definition_id) REFERENCES platform_lifecycle_definitions(id)
);

CREATE INDEX IF NOT EXISTS idx_reference_scenarios_scope
ON platform_mission_reference_scenarios(country_code,sector_code,status,version DESC);
CREATE INDEX IF NOT EXISTS idx_reference_scenarios_lifecycle
ON platform_mission_reference_scenarios(lifecycle_definition_id,status,version DESC);

INSERT OR IGNORE INTO platform_mission_reference_scenarios
(scenario_code,name,description,country_code,sector_code,lifecycle_definition_id,version,status,mission_contract_json,steps_json,exception_contract_json,verification_contract_json,metadata_json,created_by_type,created_by_id)
SELECT
  'general.mission.execution',
  'Generic Mission Execution',
  'Sector-neutral reference contract. Specialized sector and country scenarios may extend the canonical lifecycle and action system.',
  NULL,
  'general',
  id,
  1,
  'active',
  '{"required":["objective"],"truthAuthority":"canonical_mission","assignmentAuthority":"canonical_assignment","executionBoundary":"canonical_action_application_service"}',
  '[{"sequence":10,"code":"START","actionCode":"start_operation","fromStates":["CREATED"],"toState":"IN_PROGRESS","risk":"LOW"},{"sequence":20,"code":"COMPLETE","actionCode":"complete_operation","fromStates":["IN_PROGRESS"],"toState":"COMPLETED","risk":"HIGH_IMPACT"}]',
  '{"unknown":"verify_then_reassess","timeout":"verify_then_reassess","conflict":"escalate_human"}',
  '{"execution":"canonical_state","completion":"canonical_terminal_state","unknown":"never_assume_success"}',
  '{"scope":"global","referenceOnly":true}',
  'system',
  '11.14.0'
FROM platform_lifecycle_definitions
WHERE lifecycle_key='general.default' AND version=1;

INSERT OR IGNORE INTO platform_mission_reference_scenarios
(scenario_code,name,description,country_code,sector_code,lifecycle_definition_id,version,status,mission_contract_json,steps_json,exception_contract_json,verification_contract_json,metadata_json,created_by_type,created_by_id)
SELECT
  'logistics.pickup-delivery.de',
  'Logistics Pickup → Transport → Delivery → Proof',
  'Germany-first logistics reference mission. It proves the reusable mission-execution loop without making Germany or logistics part of the platform core.',
  'DE',
  'logistics',
  id,
  1,
  'active',
  '{"required":["objective","pickup_stop","delivery_stop","object","execution_assignment"],"evidence":["delivery_proof"],"truthAuthority":"canonical_mission","assignmentAuthority":"canonical_assignment","executionBoundary":"canonical_action_application_service"}',
  '[{"sequence":10,"code":"ASSIGN","actionCode":"assign_driver","fromStates":["Pending"],"toState":"Pending","risk":"HIGH_IMPACT","humanApprovalRequired":true,"verification":"canonical_assignment"},{"sequence":20,"code":"ARRIVAL","actionCode":"confirm_arrival","fromStates":["Pending"],"toState":"Arrived","risk":"LOW","verification":"canonical_mission_status"},{"sequence":30,"code":"PICKUP","actionCode":"confirm_pickup","fromStates":["Arrived"],"toState":"PickedUp","risk":"LOW","verification":"canonical_mission_status"},{"sequence":40,"code":"TRANSIT","actionCode":"start_transit","fromStates":["PickedUp"],"toState":"InTransit","risk":"LOW","verification":"canonical_mission_status"},{"sequence":50,"code":"DELIVERY","actionCode":"confirm_delivery","fromStates":["InTransit"],"toState":"Delivered","risk":"LOW","evidenceRequired":true,"verification":"canonical_mission_status"},{"sequence":60,"code":"PROOF","actionCode":"capture_delivery_proof","fromStates":["Delivered"],"toState":"Delivered","risk":"LOW","evidenceRequired":true,"verification":"delivery_proof"},{"sequence":70,"code":"COMPLETE","actionCode":"complete_mission","fromStates":["Delivered"],"toState":"Completed","risk":"HIGH_IMPACT","humanApprovalRequired":true,"evidenceRequired":true,"verification":"completion_gate"}]',
  '{"late_executor":{"response":"reassess_assignment_or_escalate"},"pickup_unavailable":{"response":"report_exception_and_replan"},"vehicle_problem":{"response":"reassess_assignment_and_replan"},"delivery_delay":{"response":"replan_eta_and_escalate_if_breach"},"recipient_unavailable":{"response":"reassess_delivery_and_wait_or_escalate"},"missing_pod":{"response":"remain_unverified_and_request_evidence"},"provider_unavailable":{"response":"unknown_then_verify_or_escalate"},"timeout":{"response":"never_blind_retry; verify_external_state"},"duplicate_request":{"response":"idempotency_reconciliation"},"conflicting_state":{"response":"stop_and_reconcile_canonical_truth"}}',
  '{"assignment":"mission_assignments","arrival":"mission.status","pickup":"mission.status","transit":"mission.status","delivery":"mission.status","proof":"delivery_proof","completion":"completion_gate","unknown":"never_assume_success"}',
  '{"scope":"DE/logistics","referenceOnly":true,"firstLaunch":true,"platformNeutral":true}' ,
  'system',
  '11.14.0'
FROM platform_lifecycle_definitions
WHERE lifecycle_key='logistics.default' AND version=1;
