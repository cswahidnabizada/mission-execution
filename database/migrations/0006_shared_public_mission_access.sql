-- V6: shared ForYou access for authenticated tenants + executors.
-- Run once before deploying V6.

ALTER TABLE public_mission_requests ADD COLUMN requester_type TEXT;
ALTER TABLE public_mission_requests ADD COLUMN requester_company_id INTEGER;
ALTER TABLE public_mission_requests ADD COLUMN requester_identity_id INTEGER;

CREATE TABLE IF NOT EXISTS mission_tenant_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id INTEGER NOT NULL,
  owner_company_id INTEGER NOT NULL,
  access_company_id INTEGER NOT NULL,
  request_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  approved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (access_company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (request_id) REFERENCES public_mission_requests(id) ON DELETE SET NULL,
  UNIQUE(mission_id, access_company_id)
);

CREATE INDEX IF NOT EXISTS idx_mission_tenant_access_company
ON mission_tenant_access(access_company_id, status, mission_id);

CREATE INDEX IF NOT EXISTS idx_mission_tenant_access_owner
ON mission_tenant_access(owner_company_id, status, mission_id);

CREATE TABLE IF NOT EXISTS mission_tenant_driver_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id INTEGER NOT NULL,
  owner_company_id INTEGER NOT NULL,
  access_company_id INTEGER NOT NULL,
  driver_id INTEGER NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (access_company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
  UNIQUE(mission_id, access_company_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_driver_assignment_driver
ON mission_tenant_driver_assignments(access_company_id, driver_id, mission_id);

CREATE INDEX IF NOT EXISTS idx_public_requests_requester_company
ON public_mission_requests(requester_company_id, mission_id, status);

CREATE INDEX IF NOT EXISTS idx_public_requests_executor
ON public_mission_requests(executor_id, mission_id, status);
