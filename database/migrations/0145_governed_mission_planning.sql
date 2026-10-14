-- ON Mission 13.7.0 — Governed Mission Planning
-- Planning is a proposal authority only. Mission truth, authorization, assignment and execution remain canonical owners.
CREATE TABLE IF NOT EXISTS mission_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_key TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  context_hash TEXT NOT NULL,
  state_token TEXT NOT NULL,
  objective_json TEXT NOT NULL DEFAULT '{}',
  plan_json TEXT NOT NULL DEFAULT '{}',
  plan_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PROPOSED' CHECK(status IN ('PROPOSED','SUPERSEDED','ACCEPTED','REJECTED','EXPIRED')),
  source_version TEXT NOT NULL,
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(mission_id) REFERENCES missions(id)
);
CREATE INDEX IF NOT EXISTS idx_mission_plans_mission_status ON mission_plans(company_id,mission_id,status,id DESC);
CREATE INDEX IF NOT EXISTS idx_mission_plans_context ON mission_plans(company_id,mission_id,context_hash);
INSERT OR IGNORE INTO canonical_capability_registry(code,label,domain_code,description) VALUES
('continuity','Mission Continuity','platform','Determines and records the governed next situation without owning mission truth or execution.'),
('planning','Planning','platform','Produces a governed, explainable, non-executing candidate mission plan from canonical truth, situation, constraints, capabilities and resources.');
UPDATE canonical_capability_contracts
SET version='2',
    commands_json='["create_plan","accept_plan"]',
    queries_json='["read_plan","read_plan_history"]',
    resource_types_json='["mission","resource","capability","policy","configuration","assignment"]',
    preconditions_json='["current_truth","current_situation","readiness_context","capability_command_contracted","required_resources_contracted"]',
    postconditions_json='["plan_is_non_authoritative","plan_context_hash_recorded","plan_hash_recorded","canonical_revalidation_required"]',
    failure_contract_json='{"stale":"409","canonical_unavailable":"503","resource_contract_unavailable":"503","unsafe_plan":"422"}',
    verification_contract_json='{"required":"context_hash_and_plan_hash","execution":"canonical_revalidation_before_authorization"}',
    recovery_contract_json='{"strategy":"replan","automatic_execution":false}',
    observability_json='{"plan_id":true,"plan_hash":true,"context_hash":true,"recommended_action":true,"confidence":true}'
WHERE capability_code='planning';
UPDATE platform_control_plane_resource_contracts
SET consumer_scope_json='{"scope":"platform_or_tenant","capabilities":["platform_control","resource_governance","planning","readiness","situation_intelligence","mission_assignment","execution","verification","recovery"]}',
    version='3'
WHERE resource_type='configuration' AND resource_key='*';
