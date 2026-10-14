-- V7.4.2 Mission Awareness: recipient-specific NEW/seen state.
CREATE TABLE IF NOT EXISTS mission_recipient_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id INTEGER NOT NULL,
  mission_owner_company_id INTEGER NOT NULL,
  recipient_key TEXT NOT NULL,
  recipient_role TEXT NOT NULL CHECK(recipient_role IN ('admin','driver','executor')),
  recipient_tenant_id INTEGER,
  recipient_driver_id INTEGER,
  recipient_executor_id INTEGER,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_owner_company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(recipient_tenant_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(recipient_driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
  FOREIGN KEY(recipient_executor_id) REFERENCES public_executor_identities(id) ON DELETE CASCADE,
  UNIQUE(mission_id,recipient_key)
);
CREATE INDEX IF NOT EXISTS idx_mission_recipient_state_unseen
ON mission_recipient_state(recipient_key,acknowledged_at,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mission_recipient_state_mission
ON mission_recipient_state(mission_id,mission_owner_company_id);
