-- ON Mission 10.31.66 — Subscription Policy & Usage Engine
-- Additive commercial policy layer. Stripe remains billing truth for paid subscriptions.
CREATE TABLE IF NOT EXISTS subscription_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL,
  country_code TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  billing_mode TEXT NOT NULL DEFAULT 'paid',
  billing_period_days INTEGER NOT NULL DEFAULT 30,
  grace_days INTEGER NOT NULL DEFAULT 7,
  verification_required INTEGER NOT NULL DEFAULT 1,
  max_drivers INTEGER,
  max_missions_period INTEGER,
  max_storage_mb INTEGER,
  public_missions_enabled INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(subject_type,country_code,plan_code)
);
CREATE INDEX IF NOT EXISTS idx_subscription_policies_lookup ON subscription_policies(subject_type,country_code,active);

CREATE TABLE IF NOT EXISTS subscription_usage_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  executor_id INTEGER,
  subject_type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  missions_created INTEGER NOT NULL DEFAULT 0,
  drivers_created INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(subject_type,company_id,executor_id,period_start)
);
CREATE INDEX IF NOT EXISTS idx_subscription_usage_company ON subscription_usage_periods(company_id,subject_type,period_start);
CREATE INDEX IF NOT EXISTS idx_subscription_usage_executor ON subscription_usage_periods(executor_id,subject_type,period_start);

INSERT OR IGNORE INTO subscription_policies
(subject_type,country_code,plan_code,billing_mode,billing_period_days,grace_days,verification_required,max_drivers,max_missions_period,max_storage_mb,public_missions_enabled) VALUES
('tenant_admin','DE','starter','paid',30,7,1,5,200,1024,0),
('tenant_admin','DE','business','paid',30,7,1,25,2000,10240,1),
('tenant_admin','US','starter','paid',30,7,1,5,200,1024,0),
('tenant_admin','US','business','paid',30,7,1,25,2000,10240,1),
('tenant_admin','ZZ','starter','paid',30,7,1,5,200,1024,0),
('tenant_admin','ZZ','business','paid',30,7,1,25,2000,10240,1),
('tenant_admin','AF','starter','free',30,0,1,5,200,1024,0),
('independent_executor','DE','executor','free',30,0,1,NULL,100,NULL,0),
('independent_executor','US','executor','free',30,0,1,NULL,100,NULL,0),
('independent_executor','ZZ','executor','free',30,0,1,NULL,100,NULL,0),
('independent_executor','AF','executor','free',30,0,1,NULL,100,NULL,0);
