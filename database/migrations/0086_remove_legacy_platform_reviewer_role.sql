-- ON Mission 10.38.10
-- Replace the retired platform role authority from the canonical platform role authority.
-- Platform Control is exclusively Super Admin authenticated and authorized.


CREATE TABLE platform_user_roles_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform_user_id INTEGER NOT NULL,
  role_code TEXT NOT NULL CHECK(role_code IN ('owner','admin','manager','operator','driver','developer','platform_support','platform_administrator','platform_super_administrator')),
  scope_type TEXT NOT NULL DEFAULT 'tenant' CHECK(scope_type IN ('tenant','platform','network','mission')),
  scope_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(platform_user_id) REFERENCES platform_users(id) ON DELETE CASCADE,
  UNIQUE(platform_user_id, role_code, scope_type, scope_id)
);

INSERT INTO platform_user_roles_new
  (id,platform_user_id,role_code,scope_type,scope_id,active,created_at,updated_at)
SELECT id,platform_user_id,role_code,scope_type,scope_id,active,created_at,updated_at
FROM platform_user_roles
WHERE role_code IN ('owner','admin','manager','operator','driver','developer','platform_support','platform_administrator','platform_super_administrator');

DROP TABLE platform_user_roles;
ALTER TABLE platform_user_roles_new RENAME TO platform_user_roles;
CREATE INDEX idx_platform_user_roles_scope ON platform_user_roles(role_code,scope_type,scope_id,active);

