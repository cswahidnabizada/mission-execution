-- ON Mission 10.31.59 — Allow pending company verification without a verification timestamp.
-- A pending company is intentionally unverified, so verified_at must be nullable.
-- Rebuild the small status table because SQLite cannot directly drop NOT NULL from a column.
CREATE TABLE company_verification_status_new (
  company_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'verified',
  country_code TEXT NOT NULL DEFAULT 'DE',
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id)
);

INSERT INTO company_verification_status_new
  (company_id,status,country_code,verified_at,created_at,updated_at)
SELECT
  company_id,status,country_code,verified_at,created_at,updated_at
FROM company_verification_status;

DROP TABLE company_verification_status;
ALTER TABLE company_verification_status_new RENAME TO company_verification_status;
