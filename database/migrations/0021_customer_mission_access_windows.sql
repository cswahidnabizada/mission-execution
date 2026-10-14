-- V7.4.1 Smart Mission Builder + Customer Integration + Site Access Windows

ALTER TABLE missions ADD COLUMN customer_id INTEGER REFERENCES network_customers(id) ON DELETE SET NULL;
ALTER TABLE missions ADD COLUMN pickup_access_from TEXT;
ALTER TABLE missions ADD COLUMN pickup_access_to TEXT;
ALTER TABLE missions ADD COLUMN delivery_access_from TEXT;
ALTER TABLE missions ADD COLUMN delivery_access_to TEXT;

CREATE INDEX IF NOT EXISTS idx_missions_customer ON missions(company_id,customer_id,mission_date DESC);

CREATE TABLE IF NOT EXISTS network_customer_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  company_name TEXT NOT NULL,
  address TEXT NOT NULL,
  access_from TEXT,
  access_to TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(customer_id) REFERENCES network_customers(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_customer_locations ON network_customer_locations(company_id,customer_id,active,label);
