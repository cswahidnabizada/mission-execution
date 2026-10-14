-- ON Mission 13.6.0 — Canonical Mission Continuity / Next Situation
-- One authority derives and durably records the next governed situation after an outcome.
-- It never replaces mission truth, lifecycle, assignment, authorization or execution authority.

CREATE TABLE mission_next_situations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  continuity_id TEXT NOT NULL UNIQUE,
  continuity_key TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  sequence_no INTEGER NOT NULL,
  source_outcome_id TEXT,
  mission_state_version INTEGER,
  outcome_code TEXT NOT NULL CHECK(outcome_code IN ('ACHIEVED','PARTIALLY_ACHIEVED','NOT_ACHIEVED','BLOCKED','WAITING','UNKNOWN','CANCELLED')),
  state TEXT NOT NULL CHECK(state IN ('NEXT_SITUATION_READY','ACTIONABLE','WAITING','RECOVERY_REQUIRED','TERMINAL','DEFERRED')),
  reason_code TEXT NOT NULL,
  action_code TEXT,
  assignment_id INTEGER,
  assignment_version INTEGER,
  attempt_id TEXT,
  context_hash TEXT NOT NULL,
  context_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_mission_next_situation_sequence
ON mission_next_situations(company_id,mission_id,sequence_no);
CREATE INDEX idx_mission_next_situation_current
ON mission_next_situations(company_id,mission_id,created_at DESC,id DESC);
CREATE INDEX idx_mission_next_situation_state
ON mission_next_situations(company_id,state,created_at DESC,id DESC);
CREATE INDEX idx_mission_next_situation_outcome
ON mission_next_situations(source_outcome_id,created_at DESC);

CREATE TRIGGER mission_next_situations_no_update
BEFORE UPDATE ON mission_next_situations
BEGIN
  SELECT RAISE(ABORT,'MISSION_NEXT_SITUATION_APPEND_ONLY');
END;
CREATE TRIGGER mission_next_situations_no_delete
BEFORE DELETE ON mission_next_situations
BEGIN
  SELECT RAISE(ABORT,'MISSION_NEXT_SITUATION_APPEND_ONLY');
END;

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('mission_next_situations','context_json','CONFIDENTIAL','mission_execution','DE_MISSION_DEFAULT',0,1,'DE-GDPR-1'),
('mission_next_situations','context_hash','SECURITY_SENSITIVE','mission_execution','DE_SECURITY_AUDIT',0,1,'DE-GDPR-1');

INSERT OR IGNORE INTO canonical_capability_registry(code,label,domain_code,description)
VALUES('continuity','Mission Continuity','platform','Derives and durably records the governed next situation after a mission outcome without mutating mission truth or authorizing execution.');

INSERT OR IGNORE INTO canonical_capability_contracts
(capability_code,version,purpose,inputs_json,outputs_json,commands_json,queries_json,resource_types_json,risk_class,tenant_scope,side_effects_json,dependencies_json,preconditions_json,postconditions_json,failure_contract_json,verification_contract_json,recovery_contract_json,health_contract_json,observability_json)
VALUES(
  'continuity','1','Derives and records the governed next situation after an outcome','["mission","outcome","assignment","execution_context"]','["next_situation"]','["record_next_situation"]','["read_next_situation"]','["mission","outcome","assignment"]','low','tenant','["continuity_projection"]','["mission_truth","outcome","assignment"]','["canonical_outcome"]','["durable_next_situation","append_only","mission_truth_not_replaced","no_authorization_inference","no_execution"]','{"canonical_unavailable":"503","unknown":"DEFERRED"}','{"required":"outcome_context"}','{"strategy":"reassess"}','{"required":"continuity_authority"}','{"durable":true,"append_only":true,"authority":"mission-continuity-authority"}'
);
UPDATE canonical_capability_contracts
SET version='1',
    inputs_json='["mission","outcome","assignment","execution_context"]',
    outputs_json='["next_situation"]',
    commands_json='["record_next_situation","read_next_situation"]',
    postconditions_json='["durable_next_situation","append_only","mission_truth_not_replaced","no_authorization_inference","no_execution"]',
    observability_json=json_set(COALESCE(observability_json,'{}'),'$.release','13.6.0')
WHERE capability_code='continuity';
