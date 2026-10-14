CREATE TABLE IF NOT EXISTS mission_event_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_key TEXT NOT NULL UNIQUE,
  transition_key TEXT NOT NULL UNIQUE,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  action_code TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'processing'
    CHECK(outcome IN ('processing','committed','failed')),
  actor_role TEXT NOT NULL,
  actor_identity_id INTEGER,
  actor_name TEXT,
  from_status TEXT,
  to_status TEXT,
  state_token_before TEXT,
  state_token_after TEXT,
  result_json TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  committed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mission_event_ledger_mission
ON mission_event_ledger(company_id,mission_id,id DESC);

CREATE INDEX IF NOT EXISTS idx_mission_event_ledger_outcome
ON mission_event_ledger(outcome,updated_at DESC);
