-- ON Mission 10.31.73 — Canonical User Classification & Readiness
-- Additive foundation. Existing auth roles remain compatibility inputs; no existing rows are deleted.

CREATE TABLE IF NOT EXISTS platform_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  principal_type TEXT NOT NULL CHECK(principal_type IN ('tenant','executor')),
  principal_id INTEGER NOT NULL,
  account_state TEXT NOT NULL DEFAULT 'active' CHECK(account_state IN ('invited','registered','active','restricted','suspended','deactivated','deleted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(principal_type, principal_id)
);

CREATE TABLE IF NOT EXISTS platform_user_actors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_user_id INTEGER NOT NULL,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('read_only_user','action_user','tenant','independent_executor','driver','platform_actor')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(platform_user_id) REFERENCES platform_users(id) ON DELETE CASCADE,
  UNIQUE(platform_user_id, actor_type)
);

CREATE TABLE IF NOT EXISTS platform_user_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_user_id INTEGER NOT NULL,
  role_code TEXT NOT NULL CHECK(role_code IN ('owner','admin','manager','operator','driver','developer','platform_reviewer','platform_support','platform_administrator','platform_super_administrator')),
  scope_type TEXT NOT NULL DEFAULT 'tenant' CHECK(scope_type IN ('tenant','platform','network','mission')),
  scope_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(platform_user_id) REFERENCES platform_users(id) ON DELETE CASCADE,
  UNIQUE(platform_user_id, role_code, scope_type, scope_id)
);

CREATE TABLE IF NOT EXISTS platform_user_memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_user_id INTEGER NOT NULL,
  membership_type TEXT NOT NULL CHECK(membership_type IN ('tenant','network','mission','platform')),
  membership_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('pending','active','suspended','revoked')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(platform_user_id) REFERENCES platform_users(id) ON DELETE CASCADE,
  UNIQUE(platform_user_id, membership_type, membership_id)
);

CREATE TABLE IF NOT EXISTS platform_user_restrictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_user_id INTEGER NOT NULL,
  restriction_code TEXT NOT NULL,
  reason TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  FOREIGN KEY(platform_user_id) REFERENCES platform_users(id) ON DELETE CASCADE,
  UNIQUE(platform_user_id, restriction_code)
);

CREATE TABLE IF NOT EXISTS readiness_definitions (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  actor_type TEXT,
  ordinal INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS readiness_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  readiness_code TEXT NOT NULL,
  requirement_code TEXT NOT NULL,
  requirement_label TEXT NOT NULL,
  requirement_kind TEXT NOT NULL CHECK(requirement_kind IN ('identity','verification','jurisdiction','profile','membership','role','entitlement','security','system')),
  blocking INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(readiness_code) REFERENCES readiness_definitions(code) ON DELETE CASCADE,
  UNIQUE(readiness_code, requirement_code)
);

CREATE TABLE IF NOT EXISTS user_readiness_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_user_id INTEGER NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(platform_user_id) REFERENCES platform_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_platform_users_principal ON platform_users(principal_type,principal_id,account_state);
CREATE INDEX IF NOT EXISTS idx_platform_user_roles_scope ON platform_user_roles(role_code,scope_type,scope_id,active);
CREATE INDEX IF NOT EXISTS idx_platform_user_memberships ON platform_user_memberships(membership_type,membership_id,status);
CREATE INDEX IF NOT EXISTS idx_platform_user_restrictions ON platform_user_restrictions(platform_user_id,active);
CREATE INDEX IF NOT EXISTS idx_user_readiness_events_user ON user_readiness_events(platform_user_id,created_at DESC);

INSERT OR IGNORE INTO platform_users(principal_type,principal_id,account_state)
SELECT 'tenant',id,CASE WHEN active=1 THEN 'active' ELSE 'deactivated' END FROM auth_identities;
INSERT OR IGNORE INTO platform_users(principal_type,principal_id,account_state)
SELECT 'executor',id,CASE WHEN active=1 THEN 'active' ELSE 'deactivated' END FROM public_executor_identities;

INSERT OR IGNORE INTO platform_user_actors(platform_user_id,actor_type)
SELECT pu.id,CASE WHEN ai.role='driver' THEN 'driver' ELSE 'tenant' END
FROM platform_users pu JOIN auth_identities ai ON pu.principal_type='tenant' AND pu.principal_id=ai.id;
INSERT OR IGNORE INTO platform_user_actors(platform_user_id,actor_type)
SELECT id,'independent_executor' FROM platform_users WHERE principal_type='executor';

INSERT OR IGNORE INTO platform_user_roles(platform_user_id,role_code,scope_type,scope_id)
SELECT pu.id,CASE WHEN ai.role='driver' THEN 'driver' WHEN ai.id=(SELECT MIN(ai2.id) FROM auth_identities ai2 WHERE ai2.company_id=ai.company_id AND ai2.role='admin' AND ai2.active=1) THEN 'owner' ELSE 'admin' END,'tenant',ai.company_id
FROM platform_users pu JOIN auth_identities ai ON pu.principal_type='tenant' AND pu.principal_id=ai.id;
INSERT OR IGNORE INTO platform_user_memberships(platform_user_id,membership_type,membership_id,status)
SELECT pu.id,'tenant',ai.company_id,'active'
FROM platform_users pu JOIN auth_identities ai ON pu.principal_type='tenant' AND pu.principal_id=ai.id;
INSERT OR IGNORE INTO platform_user_memberships(platform_user_id,membership_type,membership_id,status)
SELECT pu.id,'platform',NULL,'active' FROM platform_users pu WHERE pu.principal_type='executor';

INSERT OR IGNORE INTO readiness_definitions(code,label,description,actor_type,ordinal) VALUES
('read_only','Read-only','Can access account-safe information and see what is required next.', 'read_only_user',10),
('identity_ready','Identity ready','Identity and authentication foundation is complete.',NULL,20),
('verified','Verified','Required identity, verification and jurisdiction checks are complete.',NULL,30),
('action_ready','Action ready','The user has an authorized actor context and can perform permitted actions.', 'action_user',40),
('tenant_ready','Ready tenant','A tenant owner has a valid organization, jurisdiction, verification and commercial access path.', 'tenant',50),
('executor_ready','Ready independent executor','An independent executor has a complete operational profile and valid access path.', 'independent_executor',50),
('driver_ready','Ready driver','A tenant-created driver has an active tenant relationship and operational profile.', 'driver',50),
('manager_ready','Ready manager','A manager has an authorized tenant role and valid operational access.',NULL,60),
('developer_ready','Ready developer','A developer has explicit platform/development scope and privileged authentication.', 'platform_actor',60),
('platform_control_ready','Platform control ready','A platform administrator has explicit privileged platform scope and security readiness.', 'platform_actor',70);

INSERT OR IGNORE INTO readiness_requirements(readiness_code,requirement_code,requirement_label,requirement_kind,blocking) VALUES
('identity_ready','authenticated','Authenticated session','identity',1),
('verified','identity_verification','Required verification complete','verification',1),
('verified','jurisdiction_verified','Jurisdiction verified','jurisdiction',1),
('action_ready','active_account','Account active','system',1),
('action_ready','authorized_actor','Authorized actor context','role',1),
('tenant_ready','tenant_membership','Tenant membership active','membership',1),
('tenant_ready','tenant_verification','Tenant verification complete','verification',1),
('tenant_ready','tenant_entitlement','Tenant entitlement available','entitlement',1),
('executor_ready','executor_profile','Executor operational profile complete','profile',1),
('executor_ready','executor_membership','Executor platform relationship active','membership',1),
('driver_ready','driver_membership','Driver belongs to an active tenant','membership',1),
('driver_ready','driver_profile','Driver operational profile available','profile',1),
('manager_ready','manager_role','Manager role explicitly assigned','role',1),
('developer_ready','developer_role','Developer role explicitly assigned','role',1),
('developer_ready','privileged_auth','Privileged authentication required','security',1),
('platform_control_ready','platform_admin_role','Platform administrator role explicitly assigned','role',1),
('platform_control_ready','privileged_auth','Privileged authentication required','security',1),
('platform_control_ready','no_active_restriction','No active restriction','system',1);
