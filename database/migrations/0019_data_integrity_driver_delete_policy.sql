-- V7.3.7 production data-integrity hardening.
-- Rebuild driver_content_preferences so parent deletion is safe at the database level.

CREATE TABLE driver_content_preferences_v2 (
  company_id INTEGER NOT NULL,
  driver_id INTEGER NOT NULL,
  direct_messages_cleared_through_id INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(company_id,driver_id),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(driver_id) REFERENCES drivers(id) ON DELETE CASCADE
);

INSERT INTO driver_content_preferences_v2(company_id,driver_id,direct_messages_cleared_through_id,updated_at)
SELECT company_id,driver_id,direct_messages_cleared_through_id,updated_at
FROM driver_content_preferences;

DROP TABLE driver_content_preferences;
ALTER TABLE driver_content_preferences_v2 RENAME TO driver_content_preferences;

CREATE INDEX IF NOT EXISTS idx_driver_content_preferences_driver
ON driver_content_preferences(company_id,driver_id);
