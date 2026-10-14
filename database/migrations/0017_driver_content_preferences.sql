-- V7.3.3 driver content preferences.
-- Clearing direct messages hides old messages from the driver's own view only.
-- Tenant-side operational history remains intact.

CREATE TABLE IF NOT EXISTS driver_content_preferences (
  company_id INTEGER NOT NULL,
  driver_id INTEGER NOT NULL,
  direct_messages_cleared_through_id INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(company_id,driver_id),
  FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(driver_id) REFERENCES drivers(id)
);

CREATE INDEX IF NOT EXISTS idx_driver_content_preferences_driver
ON driver_content_preferences(company_id,driver_id);
