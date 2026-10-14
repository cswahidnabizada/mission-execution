-- ON Mission 11.05.1 — Agentic Control Plane Foundation
-- Governance/control state is not canonical mission truth. It governs the agentic runtime only.

CREATE TABLE agentic_control_config (
  id INTEGER PRIMARY KEY CHECK(id=1),
  version INTEGER NOT NULL DEFAULT 1,
  mode TEXT NOT NULL CHECK(mode IN ('DISABLED','RECOMMEND_ONLY','PREPARE_ONLY','CONTROLLED_EXECUTION')),
  autonomy_level INTEGER NOT NULL CHECK(autonomy_level BETWEEN 0 AND 5),
  execution_enabled INTEGER NOT NULL DEFAULT 0 CHECK(execution_enabled IN (0,1)),
  policy_version TEXT NOT NULL,
  kill_switch_reason TEXT,
  updated_by_role TEXT,
  updated_by_id TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO agentic_control_config(id,version,mode,autonomy_level,execution_enabled,policy_version,kill_switch_reason,updated_by_role,updated_by_id)
VALUES(1,1,'RECOMMEND_ONLY',1,0,'11.05.1-BASELINE',NULL,'system','bootstrap');

CREATE TABLE agent_decision_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  decision_id TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  mission_id INTEGER,
  executor_id INTEGER,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('agent','human','system')),
  agent_id TEXT NOT NULL,
  action_code TEXT NOT NULL,
  intent_json TEXT NOT NULL DEFAULT '{}',
  context_version TEXT NOT NULL,
  context_hash TEXT NOT NULL,
  plan_json TEXT NOT NULL DEFAULT '{}',
  candidates_json TEXT NOT NULL DEFAULT '[]',
  alignment_json TEXT NOT NULL DEFAULT '{}',
  risk_class TEXT NOT NULL CHECK(risk_class IN ('READ','ADVISORY','LOW_RISK','OPERATIONAL','HIGH_IMPACT','IRREVERSIBLE')),
  confidence TEXT NOT NULL CHECK(confidence IN ('LOW','MEDIUM','HIGH')),
  policy_version TEXT NOT NULL,
  autonomy_level INTEGER NOT NULL CHECK(autonomy_level BETWEEN 0 AND 5),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  previous_event_hash TEXT,
  event_hash TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_agent_decision_company_mission ON agent_decision_events(company_id,mission_id,created_at DESC);
CREATE INDEX idx_agent_decision_action ON agent_decision_events(action_code,created_at DESC);
CREATE INDEX idx_agent_decision_agent ON agent_decision_events(agent_id,created_at DESC);
CREATE INDEX idx_agent_decision_risk ON agent_decision_events(risk_class,created_at DESC);
CREATE INDEX idx_agent_decision_decision ON agent_decision_events(decision_id);

CREATE TRIGGER agent_decision_events_no_update
BEFORE UPDATE ON agent_decision_events
BEGIN
  SELECT RAISE(ABORT, 'AGENT_DECISION_EVENT_APPEND_ONLY');
END;

CREATE TRIGGER agent_decision_events_no_delete
BEFORE DELETE ON agent_decision_events
BEGIN
  SELECT RAISE(ABORT, 'AGENT_DECISION_EVENT_APPEND_ONLY');
END;
