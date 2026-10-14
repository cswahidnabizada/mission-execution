-- V7.3.6 delivery proof and simplified driver situations.

ALTER TABLE missions ADD COLUMN delivery_proof_required INTEGER NOT NULL DEFAULT 1;
UPDATE missions SET delivery_proof_required=0 WHERE status IN ('Delivered','Completed');

CREATE TABLE IF NOT EXISTS mission_delivery_proofs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  file_id INTEGER NOT NULL,
  submitted_by_role TEXT NOT NULL CHECK(submitted_by_role IN ('driver','executor')),
  driver_id INTEGER,
  executor_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, mission_id),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  FOREIGN KEY(file_id) REFERENCES mission_files(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_delivery_proof_mission
ON mission_delivery_proofs(company_id, mission_id);

-- The operational situation surface is intentionally reduced to four clear states.
UPDATE driver_operational_profiles
SET situation='Unavailable', situation_updated_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
WHERE situation NOT IN ('Traffic','Driving','Break','Unavailable') OR situation IS NULL;
