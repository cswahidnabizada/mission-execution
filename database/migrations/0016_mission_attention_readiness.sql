-- V7.3.1 Mission Attention readiness + engine signals.

ALTER TABLE missions ADD COLUMN status_changed_at TEXT;
UPDATE missions
SET status_changed_at=COALESCE(
  (SELECT MAX(h.created_at) FROM mission_status_history h WHERE h.mission_id=missions.id),
  updated_at,created_at,CURRENT_TIMESTAMP
)
WHERE status_changed_at IS NULL;

ALTER TABLE mission_messages ADD COLUMN attention_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mission_messages ADD COLUMN attention_resolved_at TEXT;

CREATE TABLE IF NOT EXISTS mission_exceptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  driver_id INTEGER,
  executor_id INTEGER,
  exception_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_by_role TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  resolved_by_role TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(mission_id) REFERENCES missions(id)
);

CREATE INDEX IF NOT EXISTS idx_mission_exceptions_open
ON mission_exceptions(company_id,mission_id,status,created_at);

CREATE INDEX IF NOT EXISTS idx_mission_messages_attention
ON mission_messages(company_id,mission_id,attention_required,attention_resolved_at);
