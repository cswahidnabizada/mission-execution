-- V7.2.1: remove obsolete access-code storage and add tenant-scoped driver workspace.

DROP TABLE IF EXISTS mission_access_codes;

CREATE TABLE IF NOT EXISTS driver_operational_profiles (
  driver_id INTEGER PRIMARY KEY,
  company_id INTEGER NOT NULL,
  vehicle_type TEXT,
  current_location TEXT,
  situation TEXT NOT NULL DEFAULT 'Available',
  situation_note TEXT,
  location_updated_at TEXT,
  situation_updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(company_id, driver_id)
);

CREATE INDEX IF NOT EXISTS idx_driver_operational_company
ON driver_operational_profiles(company_id, driver_id);

CREATE TABLE IF NOT EXISTS driver_direct_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  driver_id INTEGER NOT NULL,
  sender_role TEXT NOT NULL CHECK(sender_role IN ('admin','driver')),
  sender_identity_id INTEGER,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(driver_id) REFERENCES drivers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_driver_direct_messages_scope
ON driver_direct_messages(company_id, driver_id, id);
