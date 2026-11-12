-- 16.110: append-only single-currency double-entry journal linked to the private Daftar operational ledger.
CREATE TABLE IF NOT EXISTS daftar_book_journal_transactions (
  id TEXT PRIMARY KEY,
  company_id INTEGER NOT NULL,
  source_entry_id TEXT,
  client_transaction_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('sale','purchase','expense','income','payment_in','payment_out','refund','service','wage','freight','opening_balance','adjustment')),
  debit_account TEXT NOT NULL CHECK(debit_account IN ('cash','accounts_receivable','inventory','operating_expense','sales_returns','other_income','wage_expense','freight_expense','opening_equity','adjustment_clearing','accounts_payable','sales_revenue')),
  credit_account TEXT NOT NULL CHECK(credit_account IN ('cash','accounts_receivable','inventory','operating_expense','sales_returns','other_income','wage_expense','freight_expense','opening_equity','adjustment_clearing','accounts_payable','sales_revenue')),
  amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
  currency_code TEXT NOT NULL CHECK(currency_code IN ('AFN','USD','EUR')),
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','hesabpay','afpay','hawala_record','credit','other')),
  payment_evidence_class TEXT NOT NULL DEFAULT 'merchant_reported' CHECK(payment_evidence_class IN ('merchant_reported','counterparty_acknowledged','provider_verified')),
  memo TEXT,
  created_by_identity_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,client_transaction_id),
  UNIQUE(company_id,source_entry_id),
  CHECK(debit_account<>credit_account),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(source_entry_id) REFERENCES daftar_private_entries(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_daftar_journal_company_date ON daftar_book_journal_transactions(company_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daftar_journal_company_account ON daftar_book_journal_transactions(company_id,debit_account,credit_account,currency_code);
CREATE TRIGGER IF NOT EXISTS trg_daftar_journal_no_update BEFORE UPDATE ON daftar_book_journal_transactions BEGIN SELECT RAISE(ABORT,'DAFTAR_JOURNAL_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_daftar_journal_no_delete BEFORE DELETE ON daftar_book_journal_transactions BEGIN SELECT RAISE(ABORT,'DAFTAR_JOURNAL_IMMUTABLE'); END;
CREATE TABLE IF NOT EXISTS daftar_export_audit (
  id TEXT PRIMARY KEY,
  company_id INTEGER NOT NULL,
  actor_identity_id INTEGER NOT NULL,
  export_format TEXT NOT NULL CHECK(export_format IN ('json','csv','backup_preview')),
  record_count INTEGER NOT NULL CHECK(record_count>=0),
  content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_daftar_export_audit_company ON daftar_export_audit(company_id,created_at DESC);
INSERT OR IGNORE INTO processing_purposes(code,label,description,default_legal_basis,data_minimization_rule)
VALUES('daftar_accounting_book','Digital Daftar business journal','Create balanced, append-only business journal postings linked to the organization private ledger.','contract','Keep journal postings tenant-scoped, single-currency per transaction, immutable and merchant-reported unless separately provider verified.');
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('daftar_book_journal_transactions','company_id','CONFIDENTIAL','daftar_accounting_book','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('daftar_book_journal_transactions','amount_minor','CONFIDENTIAL','daftar_accounting_book','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_book_journal_transactions','payment_evidence_class','CONFIDENTIAL','daftar_accounting_book','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_book_journal_transactions','created_by_identity_id','HIGHLY_SENSITIVE','daftar_accounting_book','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('daftar_book_journal_transactions','transaction_type','CONFIDENTIAL','daftar_accounting_book','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_book_journal_transactions','debit_account','CONFIDENTIAL','daftar_accounting_book','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_book_journal_transactions','credit_account','CONFIDENTIAL','daftar_accounting_book','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_book_journal_transactions','currency_code','CONFIDENTIAL','daftar_accounting_book','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_book_journal_transactions','payment_method','CONFIDENTIAL','daftar_accounting_book','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1'),
('daftar_book_journal_transactions','memo','CONFIDENTIAL','daftar_accounting_book','DE_COMPLIANCE_REVIEW',1,1,'DE-GDPR-1');
