-- ON Mission 11.12.0 — Execution verification and recovery evidence
-- Recovery evidence is append-only. It never replaces canonical mission truth.

CREATE TABLE agent_execution_recovery_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recovery_event_id TEXT NOT NULL UNIQUE,
  attempt_id TEXT NOT NULL,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('VERIFICATION_CONFIRMED','VERIFICATION_UNKNOWN','VERIFICATION_FAILED','RECOVERY_REQUIRED','RECOVERY_PLANNED','ESCALATED','RECOVERED')),
  recovery_state TEXT NOT NULL CHECK(recovery_state IN ('NONE','VERIFY_CANONICAL_STATE','REASSESS','RETRY_CANDIDATE','ESCALATE_HUMAN','RECOVERED')),
  strategy TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_agent_recovery_attempt ON agent_execution_recovery_events(attempt_id,created_at DESC);
CREATE INDEX idx_agent_recovery_company_mission ON agent_execution_recovery_events(company_id,mission_id,created_at DESC);
CREATE INDEX idx_agent_recovery_state ON agent_execution_recovery_events(recovery_state,created_at DESC);

CREATE TRIGGER agent_execution_recovery_events_no_delete
BEFORE DELETE ON agent_execution_recovery_events
BEGIN
  SELECT RAISE(ABORT, 'AGENT_EXECUTION_RECOVERY_DELETE_FORBIDDEN');
END;
