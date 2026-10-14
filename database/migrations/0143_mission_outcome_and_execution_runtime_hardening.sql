-- ON Mission 13.5.0 — Mission Outcome Authority + Execution Runtime Hardening
-- Outcome is a derived canonical authority. It never replaces mission truth, lifecycle,
-- assignment, authorization, execution, verification or recovery authorities.

CREATE TABLE IF NOT EXISTS mission_outcome_assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outcome_id TEXT NOT NULL UNIQUE,
  assessment_key TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  assignment_id INTEGER,
  attempt_id TEXT,
  outcome_code TEXT NOT NULL CHECK(outcome_code IN ('ACHIEVED','PARTIALLY_ACHIEVED','NOT_ACHIEVED','BLOCKED','WAITING','UNKNOWN','CANCELLED')),
  confidence TEXT NOT NULL CHECK(confidence IN ('LOW','MEDIUM','HIGH')),
  verification_status TEXT NOT NULL CHECK(verification_status IN ('VERIFIED','CANONICAL_ONLY','UNKNOWN','FAILED','NOT_APPLICABLE')),
  objective_hash TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  execution_summary_json TEXT NOT NULL DEFAULT '{}',
  recovery_summary_json TEXT NOT NULL DEFAULT '{}',
  next_situation_json TEXT NOT NULL DEFAULT '{}',
  decision_reason_json TEXT NOT NULL DEFAULT '[]',
  source_version TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mission_outcome_company_mission
ON mission_outcome_assessments(company_id,mission_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_mission_outcome_code
ON mission_outcome_assessments(company_id,outcome_code,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mission_outcome_attempt
ON mission_outcome_assessments(attempt_id,created_at DESC);

CREATE TRIGGER mission_outcome_assessments_no_update
BEFORE UPDATE ON mission_outcome_assessments
BEGIN
  SELECT RAISE(ABORT, 'MISSION_OUTCOME_ASSESSMENT_APPEND_ONLY');
END;
CREATE TRIGGER mission_outcome_assessments_no_delete
BEFORE DELETE ON mission_outcome_assessments
BEGIN
  SELECT RAISE(ABORT, 'MISSION_OUTCOME_ASSESSMENT_APPEND_ONLY');
END;

ALTER TABLE agent_execution_attempts ADD COLUMN assignment_id INTEGER;
ALTER TABLE agent_execution_attempts ADD COLUMN assignment_version INTEGER;
ALTER TABLE agent_execution_attempts ADD COLUMN runtime_lease_id TEXT;
ALTER TABLE agent_execution_attempts ADD COLUMN runtime_lease_expires_at TEXT;
ALTER TABLE agent_execution_attempts ADD COLUMN last_heartbeat_at TEXT;
ALTER TABLE agent_execution_attempts ADD COLUMN effect_hash TEXT;
ALTER TABLE agent_execution_attempts ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_agent_exec_assignment_fence
ON agent_execution_attempts(company_id,mission_id,assignment_id,assignment_version,status);
CREATE INDEX IF NOT EXISTS idx_agent_exec_runtime_lease
ON agent_execution_attempts(status,runtime_lease_expires_at,updated_at);

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('mission_outcome_assessments','evidence_json','CONFIDENTIAL','mission_execution','DE_MISSION_DEFAULT',0,1,'DE-GDPR-1'),
('mission_outcome_assessments','execution_summary_json','CONFIDENTIAL','mission_execution','DE_MISSION_DEFAULT',0,1,'DE-GDPR-1'),
('mission_outcome_assessments','recovery_summary_json','SECURITY_SENSITIVE','mission_execution','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1'),
('mission_outcome_assessments','next_situation_json','CONFIDENTIAL','mission_execution','DE_MISSION_DEFAULT',0,1,'DE-GDPR-1');

UPDATE canonical_capability_contracts
SET version='4',
    inputs_json='["authorized_command","execution_context","assignment_fence"]',
    outputs_json='["attempt","execution_status","observed_effect","effect_evidence"]',
    commands_json='["execute_action","resume_attempt","record_execution_intent","commit_verified_effect","heartbeat_attempt","fence_assignment"]',
    postconditions_json='["explicit_attempt_state","execution_intent_recorded","canonical_effect_committed_only_after_verified_external_effect","assignment_fence_matches_before_effect"]',
    observability_json=json_set(COALESCE(observability_json,'{}'),'$.runtimeHardening','13.5.0')
WHERE capability_code='execution';

UPDATE canonical_capability_contracts
SET version='2',
    inputs_json='["execution","verification","mission","objective_context"]',
    outputs_json='["outcome"]',
    commands_json='["record_outcome","read_outcome","assess_mission_outcome"]',
    postconditions_json='["immutable_outcome","verified_or_explicit_unknown","mission_truth_not_replaced","objective_evidence_required"]',
    observability_json=json_set(COALESCE(observability_json,'{}'),'$.runtimeHardening','13.5.0')
WHERE capability_code='outcome';
