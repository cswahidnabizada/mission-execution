-- ON Mission 12.9.0 — Canonical Execution Intent + External Effect Separation
-- Execution intent is an execution ledger, never a replacement for mission truth.

CREATE TABLE IF NOT EXISTS mission_execution_intents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intent_id TEXT NOT NULL UNIQUE,
  attempt_id TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  action_code TEXT NOT NULL,
  action_version TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  state_token_before TEXT,
  requested_effect_json TEXT NOT NULL DEFAULT '{}',
  execution_mode TEXT NOT NULL CHECK(execution_mode IN ('INTERNAL','EXTERNAL','HYBRID')),
  status TEXT NOT NULL CHECK(status IN ('INTENT_RECORDED','READY_FOR_PROVIDER','PROVIDER_DISPATCHED','PROVIDER_VERIFIED','READY_FOR_CANONICAL_COMMIT','CANONICAL_EFFECT_COMMITTED','EXTERNAL_UNKNOWN','RECOVERY_REQUIRED','RECOVERED','FAILED')),
  provider_code TEXT,
  provider_operation_id TEXT,
  canonical_result_json TEXT NOT NULL DEFAULT '{}',
  verification_json TEXT NOT NULL DEFAULT '{}',
  recovery_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_execution_intents_company_mission ON mission_execution_intents(company_id,mission_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_intents_status ON mission_execution_intents(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_intents_provider ON mission_execution_intents(provider_code,provider_operation_id);

CREATE TRIGGER IF NOT EXISTS mission_execution_intents_no_delete
BEFORE DELETE ON mission_execution_intents
BEGIN
  SELECT RAISE(ABORT, 'MISSION_EXECUTION_INTENT_DELETE_FORBIDDEN');
END;

ALTER TABLE agent_execution_attempts ADD COLUMN execution_intent_id TEXT;
CREATE INDEX IF NOT EXISTS idx_agent_exec_intent ON agent_execution_attempts(execution_intent_id);

UPDATE canonical_capability_contracts
SET version='2',
    commands_json='["execute_action","resume_attempt","record_execution_intent","commit_verified_effect"]',
    postconditions_json='["explicit_attempt_state","execution_intent_recorded","canonical_effect_committed_only_after_verified_external_effect"]',
    verification_contract_json='{"required":"intent_and_effect_evidence","external":"provider_verification_before_effect_commit"}',
    recovery_contract_json='{"strategy":"reconcile_intent_provider_and_truth","unknown":"remain_unresolved"}',
    observability_json='{"attempt_id":true,"intent_id":true,"phase":true,"provider_operation_id":true}'
WHERE capability_code='execution';

UPDATE canonical_capability_contracts
SET version='2',
    commands_json='["dispatch_provider","verify_provider","record_provider_operation"]',
    postconditions_json='["operation_id_or_unknown","provider_evidence_recorded"]',
    verification_contract_json='{"required":"provider_operation_id","verification":"required_before_canonical_effect"}',
    observability_json='{"provider_event":true,"request_hash":true,"intent_id":true,"operation_id":true}'
WHERE capability_code='provider_integration';

UPDATE canonical_capability_contracts
SET version='2',
    commands_json='["verify_effect"]',
    preconditions_json='["intent_exists","provider_evidence_or_internal_effect_evidence"]',
    postconditions_json='["explicit_verification_state"]',
    observability_json='{"evidence_refs":true,"intent_id":true}'
WHERE capability_code='verification';

UPDATE canonical_capability_contracts
SET version='2',
    recovery_contract_json='{"strategy":"reconcile_intent_provider_and_truth","never_auto_retry_unknown_without_verification":true}',
    observability_json='{"recovery_event":true,"intent_id":true,"provider_operation_id":true}'
WHERE capability_code='recovery';
