CREATE TABLE IF NOT EXISTS mission_custody_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','awaiting_release','ready_to_transfer','awaiting_acceptance','resolved','cancelled')),
  current_holder_type TEXT NOT NULL CHECK(current_holder_type IN ('driver','executor','tenant')),
  current_holder_id INTEGER,
  target_type TEXT CHECK(target_type IN ('driver','executor','tenant')),
  target_id INTEGER,
  resolution_type TEXT NOT NULL CHECK(resolution_type IN ('transfer','return','continue','cancel_after_resolution')),
  note TEXT,
  opened_by_identity_id INTEGER,
  released_at TEXT,
  transferred_at TEXT,
  accepted_at TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_open_custody_case
ON mission_custody_cases(mission_id)
WHERE status IN ('open','awaiting_release','ready_to_transfer','awaiting_acceptance');

CREATE INDEX IF NOT EXISTS idx_custody_case_company
ON mission_custody_cases(company_id,mission_id,created_at DESC);
