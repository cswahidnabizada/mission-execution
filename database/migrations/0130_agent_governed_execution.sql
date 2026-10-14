-- ON Mission 11.11.0 — Governed Execution Attempts
-- Execution evidence is an operational ledger. It does not replace mission truth.

CREATE TABLE agent_execution_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  decision_id TEXT NOT NULL,
  event_id TEXT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  executor_id INTEGER,
  action_code TEXT NOT NULL,
  action_version TEXT,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('agent','human','system')),
  actor_id TEXT,
  authorization_json TEXT NOT NULL DEFAULT '{}',
  request_hash TEXT NOT NULL,
  requested_effect_json TEXT NOT NULL DEFAULT '{}',
  observed_effect_json TEXT NOT NULL DEFAULT '{}',
  provider_code TEXT,
  provider_operation_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('PREPARED','AUTHORIZED','DISPATCHED','EXECUTING','SUCCEEDED','FAILED','UNKNOWN','VERIFYING','VERIFIED','RECOVERY_REQUIRED','RECOVERED')),
  verification_status TEXT NOT NULL CHECK(verification_status IN ('NOT_REQUIRED','PENDING','VERIFIED','FAILED','UNKNOWN')),
  failure_code TEXT,
  recovery_state TEXT,
  context_hash TEXT NOT NULL,
  state_token_before TEXT,
  state_token_after TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_agent_exec_company_mission ON agent_execution_attempts(company_id,mission_id,created_at DESC);
CREATE INDEX idx_agent_exec_decision ON agent_execution_attempts(decision_id);
CREATE INDEX idx_agent_exec_status ON agent_execution_attempts(status,created_at DESC);
CREATE INDEX idx_agent_exec_action ON agent_execution_attempts(action_code,created_at DESC);

CREATE TRIGGER agent_execution_attempts_no_delete
BEFORE DELETE ON agent_execution_attempts
BEGIN
  SELECT RAISE(ABORT, 'AGENT_EXECUTION_ATTEMPT_DELETE_FORBIDDEN');
END;
