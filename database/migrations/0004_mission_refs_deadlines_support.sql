-- ON Mission: per-tenant mission references, mission completion deadline, support tickets.
-- Run once against D1 before deploying this version.

ALTER TABLE missions ADD COLUMN mission_end_time TEXT;

CREATE TABLE IF NOT EXISTS mission_reference_counters (
  company_id INTEGER PRIMARY KEY,
  next_value INTEGER NOT NULL DEFAULT 100001,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- Seed counters from existing SN references when present.
INSERT OR IGNORE INTO mission_reference_counters (company_id, next_value)
SELECT
  c.id,
  COALESCE(
    (
      SELECT MAX(CAST(SUBSTR(m.reference, 4) AS INTEGER)) + 1
      FROM missions m
      WHERE m.company_id = c.id
        AND m.reference GLOB 'SN:[0-9]*'
    ),
    100001
  )
FROM companies c;

CREATE UNIQUE INDEX IF NOT EXISTS idx_missions_company_reference_unique
ON missions(company_id, reference);

CREATE TABLE IF NOT EXISTS support_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  identity_id INTEGER,
  role TEXT NOT NULL,
  contact_email TEXT,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  mission_reference TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (identity_id) REFERENCES auth_identities(id)
);

CREATE INDEX IF NOT EXISTS idx_support_company_created
ON support_requests(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_status
ON support_requests(status, created_at DESC);
