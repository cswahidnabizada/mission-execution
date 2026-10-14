-- ON Mission 10.37.4 — Canonical Subscription + Billing Commercial Product
-- Forward-safe, idempotent extension of the existing plans/subscriptions authority.
CREATE TABLE IF NOT EXISTS plan_product_configuration (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL UNIQUE,
  price_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  billing_interval TEXT NOT NULL DEFAULT 'month',
  eligible_countries_json TEXT NOT NULL DEFAULT '["*"]',
  eligible_organization_types_json TEXT NOT NULL DEFAULT '["*"]',
  eligible_sectors_json TEXT NOT NULL DEFAULT '["*"]',
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  limits_json TEXT NOT NULL DEFAULT '{}',
  version TEXT NOT NULL DEFAULT '1',
  status TEXT NOT NULL DEFAULT 'active',
  configuration_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(plan_id) REFERENCES plans(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_plan_product_configuration_status ON plan_product_configuration(status,plan_id);

CREATE TABLE IF NOT EXISTS subscription_entitlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  capability_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'entitled',
  source_type TEXT NOT NULL DEFAULT 'subscription',
  source_reference TEXT,
  limit_value TEXT,
  effective_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(plan_id) REFERENCES plans(id),
  UNIQUE(company_id,capability_code,version)
);
CREATE INDEX IF NOT EXISTS idx_subscription_entitlements_company ON subscription_entitlements(company_id,active);
CREATE INDEX IF NOT EXISTS idx_subscription_entitlements_capability ON subscription_entitlements(capability_code,status,active);

CREATE TABLE IF NOT EXISTS subscription_state_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL,
  predecessor_state TEXT,
  successor_state TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  reason_code TEXT NOT NULL,
  reason TEXT,
  provider_event_id TEXT,
  expected_version INTEGER,
  version INTEGER NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  audit_event_id TEXT,
  FOREIGN KEY(subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_subscription_transitions_subscription ON subscription_state_transitions(subscription_id,version);

CREATE TABLE IF NOT EXISTS billing_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL UNIQUE,
  country_code TEXT NOT NULL DEFAULT 'DE',
  jurisdiction_code TEXT,
  legal_name TEXT,
  billing_email TEXT,
  address_json TEXT NOT NULL DEFAULT '{}',
  currency TEXT NOT NULL DEFAULT 'EUR',
  tax_configuration_code TEXT,
  tax_registration_status TEXT NOT NULL DEFAULT 'unknown',
  provider_code TEXT,
  provider_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_billing_identities_provider ON billing_identities(provider_code,provider_customer_id);

CREATE TABLE IF NOT EXISTS billing_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  subscription_id INTEGER,
  provider_code TEXT NOT NULL,
  provider_invoice_id TEXT NOT NULL,
  invoice_number TEXT,
  status TEXT NOT NULL,
  currency TEXT NOT NULL,
  subtotal_minor INTEGER NOT NULL DEFAULT 0,
  tax_minor INTEGER NOT NULL DEFAULT 0,
  total_minor INTEGER NOT NULL DEFAULT 0,
  amount_due_minor INTEGER NOT NULL DEFAULT 0,
  amount_paid_minor INTEGER NOT NULL DEFAULT 0,
  hosted_invoice_url TEXT,
  issued_at TEXT,
  due_at TEXT,
  paid_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
  UNIQUE(provider_code,provider_invoice_id)
);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_company ON billing_invoices(company_id,issued_at);

CREATE TABLE IF NOT EXISTS billing_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  invoice_id INTEGER,
  subscription_id INTEGER,
  provider_code TEXT NOT NULL,
  provider_payment_id TEXT NOT NULL,
  status TEXT NOT NULL,
  amount_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL,
  payment_method_type TEXT,
  payment_method_brand TEXT,
  payment_method_last4 TEXT,
  failure_code TEXT,
  failure_message TEXT,
  processed_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(invoice_id) REFERENCES billing_invoices(id) ON DELETE SET NULL,
  FOREIGN KEY(subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
  UNIQUE(provider_code,provider_payment_id)
);
CREATE INDEX IF NOT EXISTS idx_billing_payments_company ON billing_payments(company_id,processed_at);

CREATE TABLE IF NOT EXISTS billing_provider_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_code TEXT NOT NULL,
  provider_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  company_id INTEGER,
  processing_status TEXT NOT NULL DEFAULT 'received',
  attempt_count INTEGER NOT NULL DEFAULT 1,
  processed_at TEXT,
  error_code TEXT,
  error_message TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_provider_events_status ON billing_provider_events(processing_status,created_at);

CREATE TABLE IF NOT EXISTS billing_reconciliation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  provider_code TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_reference TEXT,
  decision TEXT NOT NULL,
  local_state_json TEXT,
  provider_state_json TEXT,
  discrepancy_code TEXT,
  resolved INTEGER NOT NULL DEFAULT 0,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_reconciliation_company ON billing_reconciliation_events(company_id,created_at);

CREATE TABLE IF NOT EXISTS billing_state_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  predecessor_state TEXT,
  successor_state TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  provider_event_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_billing_state_transitions_company ON billing_state_transitions(company_id,entity_type,occurred_at);

CREATE TABLE IF NOT EXISTS billing_jurisdiction_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  jurisdiction_code TEXT NOT NULL,
  currency TEXT NOT NULL,
  tax_configuration_code TEXT NOT NULL,
  invoice_requirements_json TEXT NOT NULL DEFAULT '{}',
  provider_code TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  version TEXT NOT NULL DEFAULT '1',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(country_code,jurisdiction_code,version)
);
CREATE INDEX IF NOT EXISTS idx_billing_jurisdiction_policies_active ON billing_jurisdiction_policies(country_code,jurisdiction_code,active);

INSERT OR IGNORE INTO billing_jurisdiction_policies(country_code,jurisdiction_code,currency,tax_configuration_code,invoice_requirements_json,provider_code,status,version,active)
VALUES('DE','DE-GDPR-1','EUR','DE_TAX_CONFIGURED','{"legal_name":true,"registered_address":true,"invoice_number":true,"tax_information":"policy_driven"}','stripe','active','1',1);

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('billing_identities','billing_email','PERSONAL','billing','DE_BILLING_DEFAULT',0,1,'DE-GDPR-1'),
('billing_identities','address_json','PERSONAL','billing','DE_BILLING_DEFAULT',0,1,'DE-GDPR-1'),
('billing_invoices','metadata_json','CONFIDENTIAL','billing','DE_BILLING_DEFAULT',0,1,'DE-GDPR-1'),
('billing_payments','payment_method_last4','CONFIDENTIAL','billing','DE_BILLING_DEFAULT',0,1,'DE-GDPR-1'),
('billing_provider_events','metadata_json','CONFIDENTIAL','billing','DE_BILLING_DEFAULT',0,1,'DE-GDPR-1'),
('billing_reconciliation_events','provider_state_json','CONFIDENTIAL','billing','DE_BILLING_DEFAULT',0,1,'DE-GDPR-1'),
('subscription_entitlements','limit_value','INTERNAL','billing','DE_BILLING_DEFAULT',0,1,'DE-GDPR-1');

-- Ensure fresh/recovery installations have canonical plan identities. Prices and Stripe
-- price IDs remain configurable; a plan without a Stripe price cannot be purchased.
INSERT OR IGNORE INTO plans(code,name,max_drivers,max_missions_monthly,max_storage_mb,public_missions_enabled,active)
VALUES ('starter','Starter',5,200,1024,0,1),('business','Business',25,2000,10240,1,1);
INSERT OR IGNORE INTO plan_product_configuration(plan_id,price_minor,currency,billing_interval,eligible_countries_json,eligible_organization_types_json,eligible_sectors_json,capabilities_json,limits_json,version,status)
SELECT id,0,'EUR','month','["*"]','["*"]','["*"]','{"createMissions":true,"createDrivers":true,"shareForYou":false,"requestForYou":true,"shareNetwork":true,"acceptNetwork":true}','{"drivers":5,"missionsPeriod":200,"storageMb":1024}','1','active' FROM plans WHERE code='starter';
INSERT OR IGNORE INTO plan_product_configuration(plan_id,price_minor,currency,billing_interval,eligible_countries_json,eligible_organization_types_json,eligible_sectors_json,capabilities_json,limits_json,version,status)
SELECT id,0,'EUR','month','["*"]','["*"]','["*"]','{"createMissions":true,"createDrivers":true,"shareForYou":true,"requestForYou":true,"shareNetwork":true,"acceptNetwork":true}','{"drivers":25,"missionsPeriod":2000,"storageMb":10240}','1','active' FROM plans WHERE code='business';
