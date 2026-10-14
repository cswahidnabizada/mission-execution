-- ON Mission 11.18.0 — Outcome / Learning Loop
-- Learning is derived advisory evidence. It never owns mission truth, authorization,
-- policy, action execution, provider truth, or recovery authority.

CREATE TABLE agent_outcome_resolution_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resolution_id TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  company_id INTEGER NOT NULL,
  mission_id INTEGER,
  action_code TEXT NOT NULL,
  previous_outcome_code TEXT NOT NULL CHECK(previous_outcome_code IN ('RESOLVED','PROGRESSED','UNCHANGED','WORSENED','BLOCKED','WAITING','UNKNOWN')),
  resolved_outcome_code TEXT NOT NULL CHECK(resolved_outcome_code IN ('RESOLVED','PROGRESSED','UNCHANGED','WORSENED','BLOCKED','WAITING','UNKNOWN')),
  resolution_reason TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  resolver_type TEXT NOT NULL CHECK(resolver_type IN ('canonical','provider','human','system')),
  resolver_id TEXT,
  resolved_at TEXT NOT NULL,
  previous_resolution_hash TEXT,
  resolution_hash TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);
CREATE INDEX idx_agent_outcome_resolution_event ON agent_outcome_resolution_events(event_id,resolved_at DESC);
CREATE INDEX idx_agent_outcome_resolution_company ON agent_outcome_resolution_events(company_id,resolved_at DESC);
CREATE INDEX idx_agent_outcome_resolution_action ON agent_outcome_resolution_events(company_id,action_code,resolved_at DESC);
CREATE TRIGGER agent_outcome_resolution_no_update BEFORE UPDATE ON agent_outcome_resolution_events BEGIN SELECT RAISE(ABORT,'AGENT_OUTCOME_RESOLUTION_APPEND_ONLY'); END;
CREATE TRIGGER agent_outcome_resolution_no_delete BEFORE DELETE ON agent_outcome_resolution_events BEGIN SELECT RAISE(ABORT,'AGENT_OUTCOME_RESOLUTION_APPEND_ONLY'); END;

CREATE TABLE agent_learning_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learning_id TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL,
  decision_id TEXT NOT NULL,
  company_id INTEGER NOT NULL,
  mission_id INTEGER,
  action_code TEXT NOT NULL,
  outcome_code TEXT NOT NULL CHECK(outcome_code IN ('RESOLVED','PROGRESSED','UNCHANGED','WORSENED','BLOCKED','WAITING','UNKNOWN')),
  signal_code TEXT NOT NULL DEFAULT 'OUTCOME_PERFORMANCE',
  reward_score REAL NOT NULL,
  evidence_quality TEXT NOT NULL CHECK(evidence_quality IN ('LOW','MEDIUM','HIGH')),
  prediction_confidence TEXT NOT NULL CHECK(prediction_confidence IN ('LOW','MEDIUM','HIGH')),
  learning_weight REAL NOT NULL,
  observation_version TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  previous_learning_hash TEXT,
  learning_hash TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(event_id)
);
CREATE INDEX idx_agent_learning_observation_company ON agent_learning_observations(company_id,occurred_at DESC);
CREATE INDEX idx_agent_learning_observation_action ON agent_learning_observations(company_id,action_code,occurred_at DESC);
CREATE INDEX idx_agent_learning_observation_outcome ON agent_learning_observations(company_id,outcome_code,occurred_at DESC);
CREATE TRIGGER agent_learning_observations_no_update BEFORE UPDATE ON agent_learning_observations BEGIN SELECT RAISE(ABORT,'AGENT_LEARNING_OBSERVATION_APPEND_ONLY'); END;
CREATE TRIGGER agent_learning_observations_no_delete BEFORE DELETE ON agent_learning_observations BEGIN SELECT RAISE(ABORT,'AGENT_LEARNING_OBSERVATION_APPEND_ONLY'); END;

CREATE TABLE agent_learning_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  action_code TEXT NOT NULL,
  profile_version INTEGER NOT NULL DEFAULT 1,
  sample_count INTEGER NOT NULL DEFAULT 0,
  known_count INTEGER NOT NULL DEFAULT 0,
  resolved_count INTEGER NOT NULL DEFAULT 0,
  progressed_count INTEGER NOT NULL DEFAULT 0,
  unchanged_count INTEGER NOT NULL DEFAULT 0,
  worsened_count INTEGER NOT NULL DEFAULT 0,
  blocked_count INTEGER NOT NULL DEFAULT 0,
  waiting_count INTEGER NOT NULL DEFAULT 0,
  unknown_count INTEGER NOT NULL DEFAULT 0,
  mean_reward REAL,
  adverse_rate REAL,
  learned_weight REAL NOT NULL DEFAULT 0.75,
  learning_state TEXT NOT NULL CHECK(learning_state IN ('INSUFFICIENT_DATA','DEFER','STABLE','IMPROVING','DEGRADING')) DEFAULT 'INSUFFICIENT_DATA',
  minimum_sample_size INTEGER NOT NULL DEFAULT 5,
  last_learning_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(company_id,action_code)
);
CREATE INDEX idx_agent_learning_profile_company ON agent_learning_profiles(company_id,updated_at DESC);
CREATE INDEX idx_agent_learning_profile_action ON agent_learning_profiles(company_id,action_code,updated_at DESC);

CREATE TABLE agent_learning_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL UNIQUE,
  company_id INTEGER,
  processed_events INTEGER NOT NULL DEFAULT 0,
  new_observations INTEGER NOT NULL DEFAULT 0,
  profiles_updated INTEGER NOT NULL DEFAULT 0,
  resolved_unknowns INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('COMPLETED','DEGRADED','FAILED')),
  learning_version TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  error_code TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_agent_learning_runs_company ON agent_learning_runs(company_id,completed_at DESC);

-- Learning is governed derived data. It is not an execution authority and is never deleted
-- independently of the company's governed data lifecycle.
