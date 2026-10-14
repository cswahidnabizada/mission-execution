-- V7.2.9: secure in-app notification layer.
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_role TEXT NOT NULL CHECK (recipient_role IN ('admin','driver','executor')),
  recipient_tenant_id INTEGER,
  recipient_driver_id INTEGER,
  recipient_executor_id INTEGER,
  mission_id INTEGER,
  mission_owner_company_id INTEGER,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  dedupe_key TEXT NOT NULL UNIQUE,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_admin
ON notifications(recipient_role,recipient_tenant_id,id);
CREATE INDEX IF NOT EXISTS idx_notifications_driver
ON notifications(recipient_role,recipient_tenant_id,recipient_driver_id,id);
CREATE INDEX IF NOT EXISTS idx_notifications_executor
ON notifications(recipient_role,recipient_executor_id,id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread
ON notifications(read_at,recipient_role,id);

CREATE INDEX IF NOT EXISTS idx_mission_messages_scope_id ON mission_messages(company_id,mission_id,id);
