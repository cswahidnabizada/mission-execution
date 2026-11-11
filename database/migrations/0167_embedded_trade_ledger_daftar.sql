-- ON Mission 16.106.0 — Embedded Trade Ledger / Afghanistan Daftar foundation.
-- Private tenant ledger and market telemetry are deliberately separate authorities.
-- Local unit mappings remain proposed until an authorized market owner approves them.

INSERT OR IGNORE INTO processing_purposes(code,label,description,default_legal_basis,data_minimization_rule)
VALUES
('daftar_private_ledger','Digital Daftar private ledger','Store a tenant-controlled record of trade, stock, credit and service entries.','contract','Keep counterparty details and operational quantities inside the owning tenant boundary; do not copy them into market telemetry.'),
('daftar_market_telemetry','Opt-in market telemetry','Produce cohort-protected market price and activity aggregates from voluntary merchant contributions.','consent','Only accept minimized price and quantity facts after explicit tenant opt-in; exclude names, contacts, exact coordinates and private references.'),
('daftar_product_passport','Digital product passport evidence','Record provenance, custody, mission references and product evidence for a batch.','contract','Expose only a deliberately selected public passport projection; keep tenant and personal details private.'),
('daftar_fx_reference','Approved FX reference quotes','Store sourced and separately approved currency reference quotes for preview calculations only.','contract','Preserve source and observation time; never execute or imply money movement.');

CREATE TABLE IF NOT EXISTS daftar_market_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pilot','active','suspended','retired')),
  template_version TEXT NOT NULL DEFAULT '1.0.0',
  telemetry_enabled INTEGER NOT NULL DEFAULT 0 CHECK(telemetry_enabled IN (0,1)),
  minimum_cohort_size INTEGER NOT NULL DEFAULT 5 CHECK(minimum_cohort_size BETWEEN 5 AND 1000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(country_code,sector_code),
  FOREIGN KEY(country_code) REFERENCES country_catalog(code)
);

-- Afghanistan is provisioned as a controlled pilot. Product-country launch remains
-- a separate prerequisite and must be active before any tenant API can use this module.
INSERT OR IGNORE INTO daftar_market_profiles(country_code,sector_code,status,template_version,telemetry_enabled,minimum_cohort_size)
VALUES
('AF','general','pilot','1.0.0',1,5),
('AF','trade','pilot','1.0.0',1,5),
('AF','retail','pilot','1.0.0',1,5),
('AF','logistics','pilot','1.0.0',1,5),
('AF','fx','pilot','1.0.0',0,5),
('AF','labor','pilot','1.0.0',1,5);

CREATE TABLE IF NOT EXISTS daftar_market_consents (
  company_id INTEGER NOT NULL,
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  telemetry_opt_in INTEGER NOT NULL DEFAULT 0 CHECK(telemetry_opt_in IN (0,1)),
  contributor_key TEXT,
  consent_version TEXT NOT NULL,
  consented_by_identity_id INTEGER NOT NULL,
  consented_at TEXT,
  withdrawn_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(company_id,country_code,sector_code),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code)
);

CREATE TABLE IF NOT EXISTS daftar_private_entries (
  id TEXT PRIMARY KEY,
  company_id INTEGER NOT NULL,
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  client_entry_id TEXT NOT NULL,
  entry_type TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('give','get')),
  item_code TEXT,
  origin_code TEXT,
  destination_code TEXT,
  reference_code TEXT,
  quantity_milli INTEGER,
  unit_code TEXT,
  normalized_quantity_milli INTEGER,
  normalized_unit_code TEXT,
  unit_conversion_version TEXT,
  unit_price_minor INTEGER,
  amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0),
  settled_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK(settled_amount_minor >= 0 AND settled_amount_minor <= amount_minor),
  currency_code TEXT NOT NULL,
  counter_amount_minor INTEGER,
  counter_currency_code TEXT,
  exchange_rate_numerator INTEGER,
  exchange_rate_denominator INTEGER,
  exchange_rate_source TEXT,
  exchange_rate_observed_at TEXT,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','hesabpay','afpay','hawala_record','credit','other')),
  payment_status TEXT NOT NULL CHECK(payment_status IN ('reported_paid','reported_pending','partially_settled','settled')),
  counterparty_label TEXT,
  city_code TEXT,
  private_note TEXT,
  related_entry_id TEXT,
  client_recorded_at TEXT,
  created_by_identity_id INTEGER NOT NULL,
  retention_status TEXT NOT NULL DEFAULT 'active' CHECK(retention_status IN ('active','review_due','legal_hold')),
  retention_review_at TEXT NOT NULL DEFAULT (datetime('now','+1095 days')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,client_entry_id),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code),
  FOREIGN KEY(related_entry_id) REFERENCES daftar_private_entries(id)
);
CREATE INDEX IF NOT EXISTS idx_daftar_entries_tenant_created ON daftar_private_entries(company_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daftar_entries_tenant_item ON daftar_private_entries(company_id,item_code,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daftar_entries_tenant_credit ON daftar_private_entries(company_id,payment_method,payment_status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daftar_entries_retention ON daftar_private_entries(retention_status,retention_review_at);

CREATE TABLE IF NOT EXISTS daftar_sync_receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL,
  client_entry_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,idempotency_key),
  UNIQUE(company_id,client_entry_id),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(entry_id) REFERENCES daftar_private_entries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daftar_inventory_balances (
  company_id INTEGER NOT NULL,
  item_code TEXT NOT NULL,
  quantity_milli INTEGER NOT NULL CHECK(quantity_milli >= 0),
  unit_code TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(company_id,item_code),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daftar_inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  entry_id TEXT NOT NULL,
  item_code TEXT NOT NULL,
  delta_quantity_milli INTEGER NOT NULL,
  unit_code TEXT NOT NULL,
  retention_status TEXT NOT NULL DEFAULT 'active' CHECK(retention_status IN ('active','review_due','legal_hold')),
  retention_review_at TEXT NOT NULL DEFAULT (datetime('now','+1095 days')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entry_id),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(entry_id) REFERENCES daftar_private_entries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_daftar_inventory_tenant_item ON daftar_inventory_movements(company_id,item_code,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daftar_inventory_movements_retention ON daftar_inventory_movements(retention_status,retention_review_at);
CREATE TRIGGER IF NOT EXISTS trg_daftar_inventory_movement_validate
BEFORE INSERT ON daftar_inventory_movements
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM daftar_inventory_balances b
    WHERE b.company_id=NEW.company_id AND b.item_code=NEW.item_code AND b.unit_code<>NEW.unit_code
  ) THEN RAISE(ABORT,'DAFTAR_INVENTORY_UNIT_MISMATCH') END;
  SELECT CASE WHEN NEW.delta_quantity_milli<0 AND NOT EXISTS (
    SELECT 1 FROM daftar_inventory_balances b
    WHERE b.company_id=NEW.company_id AND b.item_code=NEW.item_code
      AND b.unit_code=NEW.unit_code AND b.quantity_milli>=ABS(NEW.delta_quantity_milli)
  ) THEN RAISE(ABORT,'DAFTAR_INVENTORY_INSUFFICIENT_STOCK') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_daftar_inventory_movement_apply
AFTER INSERT ON daftar_inventory_movements
BEGIN
  INSERT INTO daftar_inventory_balances(company_id,item_code,quantity_milli,unit_code)
  SELECT NEW.company_id,NEW.item_code,NEW.delta_quantity_milli,NEW.unit_code WHERE NEW.delta_quantity_milli>=0
  ON CONFLICT(company_id,item_code) DO UPDATE SET
    quantity_milli=quantity_milli+excluded.quantity_milli,
    updated_at=CURRENT_TIMESTAMP
  WHERE unit_code=excluded.unit_code;
  UPDATE daftar_inventory_balances
  SET quantity_milli=quantity_milli+NEW.delta_quantity_milli,updated_at=CURRENT_TIMESTAMP
  WHERE company_id=NEW.company_id AND item_code=NEW.item_code
    AND unit_code=NEW.unit_code AND NEW.delta_quantity_milli<0;
END;

CREATE TABLE IF NOT EXISTS daftar_credit_settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  entry_id TEXT NOT NULL,
  client_settlement_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
  currency_code TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','hesabpay','afpay','hawala_record','other')),
  recorded_by_identity_id INTEGER NOT NULL,
  retention_status TEXT NOT NULL DEFAULT 'active' CHECK(retention_status IN ('active','review_due','legal_hold')),
  retention_review_at TEXT NOT NULL DEFAULT (datetime('now','+1095 days')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,client_settlement_id),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(entry_id) REFERENCES daftar_private_entries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_daftar_credit_settlements_retention ON daftar_credit_settlements(retention_status,retention_review_at);
CREATE TRIGGER IF NOT EXISTS trg_daftar_credit_settlement_validate
BEFORE INSERT ON daftar_credit_settlements
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM daftar_private_entries e
    WHERE e.id=NEW.entry_id AND e.company_id=NEW.company_id
      AND e.payment_method='credit'
      AND e.currency_code=NEW.currency_code
      AND e.settled_amount_minor + NEW.amount_minor <= e.amount_minor
  ) THEN RAISE(ABORT,'DAFTAR_CREDIT_SETTLEMENT_INVALID') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_daftar_credit_settlement_apply
AFTER INSERT ON daftar_credit_settlements
BEGIN
  UPDATE daftar_private_entries
  SET settled_amount_minor=settled_amount_minor+NEW.amount_minor,
      payment_status=CASE WHEN settled_amount_minor+NEW.amount_minor>=amount_minor THEN 'settled' ELSE 'partially_settled' END
  WHERE id=NEW.entry_id AND company_id=NEW.company_id;
END;

CREATE TABLE IF NOT EXISTS daftar_unit_conversions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  region_code TEXT NOT NULL DEFAULT '*',
  unit_code TEXT NOT NULL,
  base_unit_code TEXT NOT NULL,
  multiplier_numerator INTEGER NOT NULL CHECK(multiplier_numerator > 0),
  multiplier_denominator INTEGER NOT NULL CHECK(multiplier_denominator > 0),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','rejected','retired')),
  source_reference TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1',
  approved_by_identity_id INTEGER,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(country_code,region_code,unit_code,version),
  FOREIGN KEY(country_code) REFERENCES country_catalog(code)
);
CREATE INDEX IF NOT EXISTS idx_daftar_unit_conversion_lookup ON daftar_unit_conversions(country_code,region_code,unit_code,status);
INSERT OR IGNORE INTO daftar_unit_conversions(country_code,region_code,unit_code,base_unit_code,multiplier_numerator,multiplier_denominator,status,source_reference,version)
VALUES
('AF','AF-HERAT','seer','kg',7,1,'proposed','Karwan Daftar prototype; local metrology confirmation required','1'),
('AF','AF-KABUL','seer','kg',7,1,'proposed','Karwan Daftar prototype; local metrology confirmation required','1'),
('AF','AF-KANDAHAR','man','kg',9,2,'proposed','Karwan Daftar prototype; local metrology confirmation required','1');

CREATE TABLE IF NOT EXISTS market_telemetry_events (
  id TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  city_code TEXT,
  item_code TEXT,
  event_kind TEXT NOT NULL CHECK(event_kind IN ('price','freight','wage','fx_reference')),
  quantity_base_milli INTEGER,
  unit_code TEXT NOT NULL,
  unit_price_minor INTEGER NOT NULL CHECK(unit_price_minor >= 0),
  trust_weight_milli INTEGER NOT NULL DEFAULT 350 CHECK(trust_weight_milli BETWEEN 1 AND 1000),
  currency_code TEXT NOT NULL,
  contributor_key TEXT NOT NULL,
  trust_class TEXT NOT NULL DEFAULT 'merchant_reported' CHECK(trust_class IN ('merchant_reported','provider_verified')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_market_telemetry_aggregate ON market_telemetry_events(country_code,sector_code,city_code,item_code,event_kind,created_at);
CREATE INDEX IF NOT EXISTS idx_market_telemetry_expiry ON market_telemetry_events(expires_at);

CREATE TABLE IF NOT EXISTS daftar_market_price_indices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  city_code TEXT,
  item_code TEXT NOT NULL,
  unit_code TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  median_unit_price_minor INTEGER NOT NULL,
  sample_count INTEGER NOT NULL,
  contributor_count INTEGER NOT NULL,
  outlier_count INTEGER NOT NULL DEFAULT 0,
  trust_class TEXT NOT NULL DEFAULT 'merchant_reported',
  window_started_at TEXT NOT NULL,
  window_ended_at TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(country_code,sector_code,city_code,item_code,unit_code,currency_code,window_ended_at)
);

CREATE TABLE IF NOT EXISTS batch_passports (
  id TEXT PRIMARY KEY,
  company_id INTEGER NOT NULL,
  current_custodian_company_id INTEGER NOT NULL,
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  product_code TEXT NOT NULL,
  batch_code TEXT NOT NULL,
  quantity_milli INTEGER NOT NULL CHECK(quantity_milli > 0),
  unit_code TEXT NOT NULL,
  normalized_quantity_milli INTEGER,
  normalized_unit_code TEXT,
  public_token_hash TEXT NOT NULL UNIQUE,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','recalled','closed')),
  created_by_identity_id INTEGER NOT NULL,
  retention_status TEXT NOT NULL DEFAULT 'active' CHECK(retention_status IN ('active','review_due','legal_hold')),
  retention_review_at TEXT NOT NULL DEFAULT (datetime('now','+1095 days')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,batch_code),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(current_custodian_company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code)
);
CREATE INDEX IF NOT EXISTS idx_batch_passport_custodian ON batch_passports(current_custodian_company_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batch_passport_retention ON batch_passports(retention_status,retention_review_at);

CREATE TABLE IF NOT EXISTS batch_events (
  id TEXT PRIMARY KEY,
  passport_id TEXT NOT NULL,
  company_id INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('origin','production','inspection','lab_test','mission','packaging','mass_balance','custody_handoff','recall')),
  input_quantity_milli INTEGER,
  output_quantity_milli INTEGER,
  additive_quantity_milli INTEGER NOT NULL DEFAULT 0,
  waste_quantity_milli INTEGER NOT NULL DEFAULT 0,
  unit_code TEXT,
  evidence_class TEXT NOT NULL DEFAULT 'merchant_attested' CHECK(evidence_class IN ('merchant_attested','mission_linked','file_hash_linked','counterparty_acknowledged','system_rule_checked')) ,
  evidence_sha256 TEXT,
  mission_id INTEGER,
  file_id INTEGER,
  evidence_reference TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_by_identity_id INTEGER NOT NULL,
  retention_status TEXT NOT NULL DEFAULT 'active' CHECK(retention_status IN ('active','review_due','legal_hold')),
  retention_review_at TEXT NOT NULL DEFAULT (datetime('now','+1095 days')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(passport_id) REFERENCES batch_passports(id) ON DELETE CASCADE,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_batch_events_passport ON batch_events(passport_id,created_at);
CREATE INDEX IF NOT EXISTS idx_batch_events_retention ON batch_events(retention_status,retention_review_at);

CREATE TABLE IF NOT EXISTS daftar_custody_transfers (
  id TEXT PRIMARY KEY,
  passport_id TEXT NOT NULL,
  from_company_id INTEGER NOT NULL,
  to_company_id INTEGER NOT NULL,
  challenge_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','expired','cancelled')),
  expires_at TEXT NOT NULL,
  confirmed_at TEXT,
  created_by_identity_id INTEGER NOT NULL,
  retention_status TEXT NOT NULL DEFAULT 'active' CHECK(retention_status IN ('active','review_due','legal_hold')),
  retention_review_at TEXT NOT NULL DEFAULT (datetime('now','+1095 days')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(passport_id) REFERENCES batch_passports(id) ON DELETE CASCADE,
  FOREIGN KEY(from_company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(to_company_id) REFERENCES companies(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_daftar_transfers_recipient ON daftar_custody_transfers(to_company_id,status,expires_at);
CREATE INDEX IF NOT EXISTS idx_daftar_custody_transfers_retention ON daftar_custody_transfers(retention_status,retention_review_at);
CREATE TRIGGER IF NOT EXISTS trg_daftar_custody_transfer_confirm_guard
BEFORE UPDATE OF status ON daftar_custody_transfers
WHEN NEW.status='confirmed' AND OLD.status='pending'
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM batch_passports p WHERE p.id=NEW.passport_id AND p.current_custodian_company_id=NEW.from_company_id)
    THEN RAISE(ABORT,'DAFTAR_TRANSFER_CUSTODY_CHANGED') END;
END;

CREATE TABLE IF NOT EXISTS daftar_fx_quotes (
  id TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  base_currency TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  rate_numerator INTEGER NOT NULL CHECK(rate_numerator > 0),
  rate_denominator INTEGER NOT NULL CHECK(rate_denominator > 0),
  source_code TEXT NOT NULL,
  source_reference TEXT,
  observed_at TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','expired','rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(country_code) REFERENCES country_catalog(code)
);
CREATE INDEX IF NOT EXISTS idx_daftar_fx_quote_lookup ON daftar_fx_quotes(country_code,base_currency,quote_currency,status,observed_at DESC);

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES
('daftar_private_entries','counterparty_label','PERSONAL','daftar_private_ledger','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_private_entries','private_note','CONFIDENTIAL','daftar_private_ledger','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_private_entries','city_code','PERSONAL','daftar_private_ledger','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_private_entries','exchange_rate_source','INTERNAL','daftar_private_ledger','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_private_entries','origin_code','CONFIDENTIAL','daftar_private_ledger','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_private_entries','destination_code','CONFIDENTIAL','daftar_private_ledger','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_private_entries','reference_code','CONFIDENTIAL','daftar_private_ledger','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_private_entries','amount_minor','CONFIDENTIAL','daftar_private_ledger','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_private_entries','counter_amount_minor','CONFIDENTIAL','daftar_private_ledger','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_private_entries','counter_currency_code','CONFIDENTIAL','daftar_private_ledger','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_private_entries','payment_method','CONFIDENTIAL','daftar_private_ledger','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_private_entries','payment_status','CONFIDENTIAL','daftar_private_ledger','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_market_consents','telemetry_opt_in','CONFIDENTIAL','daftar_market_telemetry','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_market_consents','contributor_key','SECURITY_SENSITIVE','daftar_market_telemetry','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('daftar_credit_settlements','amount_minor','CONFIDENTIAL','daftar_private_ledger','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_credit_settlements','payment_method','CONFIDENTIAL','daftar_private_ledger','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_inventory_movements','delta_quantity_milli','CONFIDENTIAL','daftar_private_ledger','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_custody_transfers','challenge_hash','SECURITY_SENSITIVE','daftar_product_passport','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('batch_passports','public_token_hash','SECURITY_SENSITIVE','daftar_product_passport','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('market_telemetry_events','contributor_key','SECURITY_SENSITIVE','daftar_market_telemetry','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('market_telemetry_events','unit_price_minor','CONFIDENTIAL','daftar_market_telemetry','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('market_telemetry_events','trust_weight_milli','INTERNAL','daftar_market_telemetry','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('daftar_fx_quotes','source_reference','INTERNAL','daftar_fx_reference','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('batch_events','details_json','INTERNAL','daftar_product_passport','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('batch_events','evidence_sha256','SECURITY_SENSITIVE','daftar_product_passport','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1');
