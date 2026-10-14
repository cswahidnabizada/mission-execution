-- ON Mission 11.05.0 — Agentic Foundation
-- Derived/learned data only. This schema never becomes canonical operational truth.

CREATE TABLE agent_outcome_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  decision_id TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  mission_id INTEGER,
  executor_id INTEGER,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('agent','human','system')),
  agent_id TEXT,
  action_code TEXT NOT NULL,
  intent_json TEXT NOT NULL DEFAULT '{}',
  context_version TEXT NOT NULL,
  context_hash TEXT NOT NULL,
  plan_json TEXT NOT NULL DEFAULT '{}',
  authorization_json TEXT NOT NULL DEFAULT '{}',
  execution_status TEXT NOT NULL CHECK(execution_status IN ('NOT_EXECUTED','EXECUTED','FAILED','BLOCKED','UNKNOWN')),
  outcome_code TEXT NOT NULL CHECK(outcome_code IN ('RESOLVED','PROGRESSED','UNCHANGED','WORSENED','BLOCKED','WAITING','UNKNOWN')),
  outcome_confidence TEXT NOT NULL CHECK(outcome_confidence IN ('LOW','MEDIUM','HIGH')),
  evidence_json TEXT NOT NULL DEFAULT '[]',
  state_version_before INTEGER,
  state_version_after INTEGER,
  model_provider TEXT,
  model_id TEXT,
  model_version TEXT,
  policy_version TEXT,
  recalibration_version TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  previous_event_hash TEXT,
  event_hash TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_agent_outcome_company_mission ON agent_outcome_events(company_id, mission_id, occurred_at DESC);
CREATE INDEX idx_agent_outcome_action ON agent_outcome_events(action_code, occurred_at DESC);
CREATE INDEX idx_agent_outcome_executor ON agent_outcome_events(executor_id, occurred_at DESC);
CREATE INDEX idx_agent_outcome_outcome ON agent_outcome_events(outcome_code, occurred_at DESC);
CREATE INDEX idx_agent_outcome_decision ON agent_outcome_events(decision_id);

CREATE TRIGGER agent_outcome_events_no_update
BEFORE UPDATE ON agent_outcome_events
BEGIN
  SELECT RAISE(ABORT, 'AGENT_OUTCOME_EVENT_APPEND_ONLY');
END;

CREATE TRIGGER agent_outcome_events_no_delete
BEFORE DELETE ON agent_outcome_events
BEGIN
  SELECT RAISE(ABORT, 'AGENT_OUTCOME_EVENT_APPEND_ONLY');
END;
