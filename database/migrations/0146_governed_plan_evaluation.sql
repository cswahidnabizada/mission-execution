-- ON Mission 13.8.0 — Governed Plan Evaluation + Autonomous Readiness
-- Evaluation is a canonical safety gate for plan acceptance; it never authorizes, assigns or executes.
CREATE TABLE IF NOT EXISTS mission_plan_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evaluation_key TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  plan_hash TEXT NOT NULL,
  context_hash TEXT NOT NULL,
  state_token TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ACCEPTABLE','REQUIRES_REVIEW','BLOCKED','STALE','UNSAFE','INSUFFICIENT_EVIDENCE','UNKNOWN')),
  evaluation_hash TEXT NOT NULL,
  findings_json TEXT NOT NULL DEFAULT '[]',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  decision_json TEXT NOT NULL DEFAULT '{}',
  source_version TEXT NOT NULL,
  expires_at TEXT,
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(mission_id) REFERENCES missions(id),
  FOREIGN KEY(plan_id) REFERENCES mission_plans(id)
);
CREATE INDEX IF NOT EXISTS idx_mission_plan_evaluations_plan ON mission_plan_evaluations(company_id,mission_id,plan_id,id DESC);
CREATE INDEX IF NOT EXISTS idx_mission_plan_evaluations_status ON mission_plan_evaluations(company_id,mission_id,status,id DESC);
CREATE INDEX IF NOT EXISTS idx_mission_plan_evaluations_hash ON mission_plan_evaluations(company_id,mission_id,plan_hash,evaluation_hash);

INSERT OR IGNORE INTO canonical_capability_registry(code,label,domain_code,description) VALUES
('planning','Planning','platform','Produces and evaluates governed, explainable, non-executing mission plans before authorization and execution.');
UPDATE canonical_capability_contracts
SET version='3',
    commands_json='["create_plan","evaluate_plan","accept_plan"]',
    queries_json='["read_plan","read_plan_history","read_plan_evaluation"]',
    resource_types_json='["mission","resource","capability","policy","configuration","assignment"]',
    preconditions_json='["current_truth","current_situation","readiness_context","capability_command_contracted","required_resources_contracted","plan_evaluation_required_before_acceptance"]',
    postconditions_json='["plan_is_non_authoritative","plan_context_hash_recorded","plan_hash_recorded","evaluation_hash_recorded","canonical_revalidation_required","execution_requires_accepted_plan"]',
    failure_contract_json='{"stale":"409","canonical_unavailable":"503","resource_contract_unavailable":"503","unsafe_plan":"422","evaluation_required":"422"}',
    verification_contract_json='{"required":"context_hash_plan_hash_evaluation_hash","acceptance":"acceptable_evaluation_and_fresh_state","execution":"accepted_plan_and_canonical_revalidation_before_authorization"}',
    recovery_contract_json='{"strategy":"replan","automatic_execution":false,"stale":"replan_and_reauthorize"}',
    observability_json='{"plan_id":true,"plan_hash":true,"evaluation_id":true,"evaluation_hash":true,"evaluation_status":true,"context_hash":true,"recommended_action":true,"confidence":true}'
WHERE capability_code='planning';
