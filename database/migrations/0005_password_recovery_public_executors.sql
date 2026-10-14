-- ON Mission V4: password recovery + independent public executors.
-- Run ONCE before deploying V4.

CREATE TABLE IF NOT EXISTS public_executor_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 100000,
  active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public_executor_profiles (
  executor_id INTEGER PRIMARY KEY,
  registered_company_name TEXT NOT NULL,
  company_category TEXT NOT NULL,
  working_cities TEXT NOT NULL DEFAULT '[]',
  working_zip_codes TEXT NOT NULL DEFAULT '[]',
  mobile TEXT NOT NULL,
  description TEXT NOT NULL,
  vehicle_types TEXT NOT NULL DEFAULT '[]',
  website TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(executor_id) REFERENCES public_executor_identities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tenant_executor_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  executor_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved',
  approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(executor_id) REFERENCES public_executor_identities(id),
  UNIQUE(company_id, executor_id)
);

CREATE TABLE IF NOT EXISTS mission_executor_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL UNIQUE,
  executor_id INTEGER NOT NULL,
  request_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  FOREIGN KEY(executor_id) REFERENCES public_executor_identities(id),
  FOREIGN KEY(request_id) REFERENCES public_mission_requests(id),
  UNIQUE(company_id, mission_id, executor_id)
);

ALTER TABLE public_mission_requests ADD COLUMN executor_id INTEGER REFERENCES public_executor_identities(id);

CREATE INDEX IF NOT EXISTS idx_public_requests_executor
ON public_mission_requests(executor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_executor_company
ON tenant_executor_links(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_executor_executor
ON tenant_executor_links(executor_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_executor_assignments_executor
ON mission_executor_assignments(executor_id, status, assigned_at DESC);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_type TEXT NOT NULL CHECK(identity_type IN ('tenant','executor')),
  identity_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_password_reset_identity
ON password_reset_tokens(identity_type, identity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_expiry
ON password_reset_tokens(expires_at, used_at);

CREATE TABLE IF NOT EXISTS public_executor_support_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  executor_id INTEGER NOT NULL,
  contact_email TEXT,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  mission_reference TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(executor_id) REFERENCES public_executor_identities(id)
);
CREATE INDEX IF NOT EXISTS idx_executor_support_created
ON public_executor_support_requests(executor_id, created_at DESC);
