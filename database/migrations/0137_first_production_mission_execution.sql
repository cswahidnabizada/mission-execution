-- ON Mission 12.0.0 — First Production Mission Execution
-- Production execution remains bounded by canonical truth, authorization, active pilot scope,
-- provider verification, recovery, and explicit outcome recording. This table is evidence only;
-- it never becomes an execution authority.

CREATE TABLE agent_production_execution_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  attempt_id TEXT,
  decision_id TEXT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  action_code TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('BOUNDARY_ACCEPTED','STARTED','SUCCEEDED','FAILED','UNKNOWN','RECOVERY_REQUIRED','OUTCOME_RECORDED')),
  production_mode TEXT NOT NULL CHECK(production_mode IN ('PILOT_SUPERVISED','PILOT_CONTROLLED')),
  pilot_id TEXT,
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  policy_version TEXT,
  policy_hash TEXT,
  context_hash TEXT,
  request_hash TEXT,
  outcome_event_id TEXT,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  previous_event_hash TEXT,
  event_hash TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);
CREATE INDEX idx_agent_production_execution_company ON agent_production_execution_events(company_id,occurred_at DESC);
CREATE INDEX idx_agent_production_execution_mission ON agent_production_execution_events(company_id,mission_id,occurred_at DESC);
CREATE INDEX idx_agent_production_execution_attempt ON agent_production_execution_events(attempt_id,occurred_at DESC);
CREATE INDEX idx_agent_production_execution_pilot ON agent_production_execution_events(company_id,pilot_id,occurred_at DESC);
CREATE TRIGGER agent_production_execution_events_no_update BEFORE UPDATE ON agent_production_execution_events BEGIN SELECT RAISE(ABORT,'AGENT_PRODUCTION_EXECUTION_APPEND_ONLY'); END;
CREATE TRIGGER agent_production_execution_events_no_delete BEFORE DELETE ON agent_production_execution_events BEGIN SELECT RAISE(ABORT,'AGENT_PRODUCTION_EXECUTION_APPEND_ONLY'); END;

