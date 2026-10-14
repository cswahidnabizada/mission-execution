-- V7.4.0 Trust Network + Direct Mission Invitations

CREATE TABLE IF NOT EXISTS network_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  customer_reference TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_network_customers_company
ON network_customers(company_id,status,company_name);

CREATE TABLE IF NOT EXISTS network_tenant_trust (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_a_id INTEGER NOT NULL,
  company_b_id INTEGER NOT NULL,
  requested_by_company_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','trusted','suspended','blocked','rejected')),
  can_receive_missions INTEGER NOT NULL DEFAULT 1,
  can_request_missions INTEGER NOT NULL DEFAULT 1,
  can_message_dispatch INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_a_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(company_b_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(requested_by_company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CHECK(company_a_id < company_b_id),
  CHECK(requested_by_company_id IN (company_a_id,company_b_id)),
  UNIQUE(company_a_id,company_b_id)
);

CREATE INDEX IF NOT EXISTS idx_network_tenant_trust_a
ON network_tenant_trust(company_a_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_network_tenant_trust_b
ON network_tenant_trust(company_b_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS network_executor_trust (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  executor_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'trusted' CHECK(status IN ('trusted','suspended','blocked')),
  can_receive_missions INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(executor_id) REFERENCES public_executor_identities(id) ON DELETE CASCADE,
  UNIQUE(company_id,executor_id)
);

CREATE INDEX IF NOT EXISTS idx_network_executor_trust
ON network_executor_trust(company_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS network_mission_invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id INTEGER NOT NULL,
  owner_company_id INTEGER NOT NULL,
  recipient_type TEXT NOT NULL CHECK(recipient_type IN ('tenant','executor')),
  recipient_company_id INTEGER,
  recipient_executor_id INTEGER,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Accepted','Rejected','Cancelled')),
  message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  FOREIGN KEY(owner_company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(recipient_company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(recipient_executor_id) REFERENCES public_executor_identities(id) ON DELETE CASCADE,
  CHECK(
    (recipient_type='tenant' AND recipient_company_id IS NOT NULL AND recipient_executor_id IS NULL)
    OR
    (recipient_type='executor' AND recipient_executor_id IS NOT NULL AND recipient_company_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_network_invitation_pending_tenant
ON network_mission_invitations(mission_id,recipient_company_id)
WHERE recipient_type='tenant' AND status='Pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_network_invitation_pending_executor
ON network_mission_invitations(mission_id,recipient_executor_id)
WHERE recipient_type='executor' AND status='Pending';

CREATE INDEX IF NOT EXISTS idx_network_invitation_tenant_inbox
ON network_mission_invitations(recipient_company_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_network_invitation_executor_inbox
ON network_mission_invitations(recipient_executor_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_network_invitation_owner
ON network_mission_invitations(owner_company_id,status,created_at DESC);
