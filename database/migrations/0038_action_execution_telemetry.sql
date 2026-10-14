-- Next-level operational observability.
-- Telemetry is diagnostic only: it never participates in mission truth,
-- authorization, lifecycle, custody, or mutation decisions.
CREATE TABLE IF NOT EXISTS action_execution_telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  mission_id INTEGER,
  actor_role TEXT NOT NULL,
  action_code TEXT NOT NULL,
  phase TEXT NOT NULL,
  outcome TEXT,
  duration_ms INTEGER,
  error_code TEXT,
  request_id TEXT,
  client_timestamp TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_action_execution_telemetry_company_time
  ON action_execution_telemetry(company_id,created_at DESC,id DESC);

CREATE INDEX IF NOT EXISTS idx_action_execution_telemetry_mission_time
  ON action_execution_telemetry(company_id,mission_id,created_at DESC,id DESC);

CREATE INDEX IF NOT EXISTS idx_action_execution_telemetry_expiry
  ON action_execution_telemetry(expires_at);
