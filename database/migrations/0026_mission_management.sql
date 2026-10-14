CREATE TABLE IF NOT EXISTS mission_management_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  code TEXT NOT NULL,
  requested_actor_type TEXT NOT NULL,
  requested_actor_id INTEGER,
  requested_by_role TEXT NOT NULL,
  requested_by_identity_id INTEGER,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','cancelled')),
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  resolved_by_role TEXT,
  resolved_by_identity_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_management_requirement_mission
ON mission_management_requirements(company_id,mission_id,status,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_management_requirement_actor
ON mission_management_requirements(requested_actor_type,requested_actor_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS mission_cancellations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL UNIQUE,
  reason_code TEXT NOT NULL,
  note TEXT,
  cancelled_by_role TEXT NOT NULL,
  cancelled_by_identity_id INTEGER,
  cancelled_by_name TEXT,
  mission_status_before TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mission_cancellation_company
ON mission_cancellations(company_id,created_at DESC);
