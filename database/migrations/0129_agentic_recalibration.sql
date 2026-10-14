-- ON Mission 11.09.0 — Agent Recalibration Store
-- Derived calibration evidence only. This schema never becomes canonical mission truth,
-- authorization, policy or execution authority.

CREATE TABLE agent_calibration_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  decision_id TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  mission_id INTEGER,
  executor_id INTEGER,
  action_code TEXT NOT NULL,
  signal_code TEXT NOT NULL DEFAULT 'DECISION_OUTCOME',
  prediction_confidence TEXT NOT NULL CHECK(prediction_confidence IN ('LOW','MEDIUM','HIGH')),
  observed_outcome TEXT NOT NULL CHECK(observed_outcome IN ('RESOLVED','PROGRESSED','UNCHANGED','WORSENED','BLOCKED','WAITING','UNKNOWN')),
  evaluation_class TEXT NOT NULL CHECK(evaluation_class IN ('CORRECT','INCORRECT','UNKNOWN','INCONCLUSIVE')),
  evidence_basis TEXT NOT NULL CHECK(evidence_basis IN ('RECORDED_AGENT_OUTCOME','UNKNOWN')),
  observation_version TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  previous_observation_hash TEXT,
  observation_hash TEXT NOT NULL UNIQUE,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX idx_agent_calibration_observation_company ON agent_calibration_observations(company_id,occurred_at DESC);
CREATE INDEX idx_agent_calibration_observation_action ON agent_calibration_observations(company_id,action_code,occurred_at DESC);
CREATE INDEX idx_agent_calibration_observation_executor ON agent_calibration_observations(company_id,executor_id,occurred_at DESC);
CREATE INDEX idx_agent_calibration_observation_class ON agent_calibration_observations(company_id,evaluation_class,occurred_at DESC);

CREATE TRIGGER agent_calibration_observations_no_update
BEFORE UPDATE ON agent_calibration_observations
BEGIN
  SELECT RAISE(ABORT, 'AGENT_CALIBRATION_OBSERVATION_APPEND_ONLY');
END;

CREATE TRIGGER agent_calibration_observations_no_delete
BEFORE DELETE ON agent_calibration_observations
BEGIN
  SELECT RAISE(ABORT, 'AGENT_CALIBRATION_OBSERVATION_APPEND_ONLY');
END;

CREATE TABLE agent_calibration_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  scope_type TEXT NOT NULL CHECK(scope_type IN ('ORGANIZATION','ACTION','EXECUTOR')),
  scope_key TEXT NOT NULL,
  signal_code TEXT NOT NULL DEFAULT 'DECISION_OUTCOME',
  action_code TEXT,
  profile_version INTEGER NOT NULL DEFAULT 1,
  sample_count INTEGER NOT NULL DEFAULT 0,
  known_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  incorrect_count INTEGER NOT NULL DEFAULT 0,
  unknown_count INTEGER NOT NULL DEFAULT 0,
  inconclusive_count INTEGER NOT NULL DEFAULT 0,
  confidence_sum REAL NOT NULL DEFAULT 0,
  confidence_error_sum REAL NOT NULL DEFAULT 0,
  accuracy REAL,
  mean_confidence REAL,
  calibration_error REAL,
  deference_state TEXT NOT NULL CHECK(deference_state IN ('INSUFFICIENT_DATA','DEFER','CAUTION','TRUSTED')) DEFAULT 'INSUFFICIENT_DATA',
  minimum_sample_size INTEGER NOT NULL DEFAULT 5,
  last_observation_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(company_id,scope_type,scope_key,signal_code)
);

CREATE INDEX idx_agent_calibration_profile_company ON agent_calibration_profiles(company_id,updated_at DESC);
CREATE INDEX idx_agent_calibration_profile_scope ON agent_calibration_profiles(company_id,scope_type,scope_key,updated_at DESC);
CREATE INDEX idx_agent_calibration_profile_action ON agent_calibration_profiles(company_id,action_code,updated_at DESC);

CREATE TABLE agent_calibration_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL UNIQUE,
  company_id INTEGER,
  processed_events INTEGER NOT NULL DEFAULT 0,
  new_observations INTEGER NOT NULL DEFAULT 0,
  profiles_updated INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('COMPLETED','DEGRADED','FAILED')),
  calibration_version TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  error_code TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_agent_calibration_runs_company ON agent_calibration_runs(company_id,completed_at DESC);
