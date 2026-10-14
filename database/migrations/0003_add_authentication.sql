-- Authentication foundation for ON Mission.
-- Safe for the current tenant/driver data: no existing companies, drivers or missions are deleted.

CREATE TABLE IF NOT EXISTS auth_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'driver')),
  driver_id INTEGER,
  login TEXT NOT NULL UNIQUE,
  email TEXT,
  display_name TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 600000,
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(driver_id) REFERENCES drivers(id),
  UNIQUE(company_id, driver_id)
);

CREATE INDEX IF NOT EXISTS idx_auth_company_role
ON auth_identities(company_id, role, active);

CREATE INDEX IF NOT EXISTS idx_auth_driver
ON auth_identities(company_id, driver_id);

CREATE TABLE IF NOT EXISTS company_verification_status (
  company_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'verified',
  country_code TEXT NOT NULL DEFAULT 'DE',
  verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id)
);
