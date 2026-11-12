-- 16.114: operational business-book controls and append-only Qarz case history.
CREATE TABLE IF NOT EXISTS daftar_book_period_locks (
  id TEXT PRIMARY KEY,
  company_id INTEGER NOT NULL,
  period_month TEXT NOT NULL CHECK(length(period_month)=7 AND substr(period_month,5,1)='-'),
  lock_status TEXT NOT NULL CHECK(lock_status IN ('locked','reopened')),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 8 AND 500),
  actor_identity_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,period_month),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_daftar_book_period_lock ON daftar_book_period_locks(company_id,period_month,lock_status);
CREATE TRIGGER IF NOT EXISTS trg_daftar_book_period_locks_no_update BEFORE UPDATE ON daftar_book_period_locks BEGIN SELECT RAISE(ABORT,'DAFTAR_BOOK_PERIOD_LOCKS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_daftar_book_period_locks_no_delete BEFORE DELETE ON daftar_book_period_locks BEGIN SELECT RAISE(ABORT,'DAFTAR_BOOK_PERIOD_LOCKS_IMMUTABLE'); END;

CREATE TABLE IF NOT EXISTS daftar_qarz_cases (
  case_id TEXT PRIMARY KEY,
  company_id INTEGER NOT NULL,
  entry_id TEXT NOT NULL,
  case_status TEXT NOT NULL CHECK(case_status IN ('open','acknowledged','disputed','resolved','rejected')),
  case_reason TEXT NOT NULL CHECK(length(case_reason) BETWEEN 8 AND 500),
  opened_by_identity_id INTEGER NOT NULL,
  assigned_to_label TEXT,
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(entry_id) REFERENCES daftar_private_entries(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_daftar_qarz_cases_tenant_status ON daftar_qarz_cases(company_id,case_status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daftar_qarz_cases_entry ON daftar_qarz_cases(company_id,entry_id,created_at DESC);
CREATE TABLE IF NOT EXISTS daftar_qarz_case_events (
  event_id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  company_id INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('opened','acknowledged','disputed','resolved','rejected','note_added')),
  event_note TEXT NOT NULL CHECK(length(event_note) BETWEEN 1 AND 1000),
  actor_identity_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(case_id) REFERENCES daftar_qarz_cases(case_id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_daftar_qarz_case_events ON daftar_qarz_case_events(company_id,case_id,created_at);
CREATE TRIGGER IF NOT EXISTS trg_daftar_qarz_case_events_no_update BEFORE UPDATE ON daftar_qarz_case_events BEGIN SELECT RAISE(ABORT,'DAFTAR_QARZ_CASE_EVENTS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_daftar_qarz_case_events_no_delete BEFORE DELETE ON daftar_qarz_case_events BEGIN SELECT RAISE(ABORT,'DAFTAR_QARZ_CASE_EVENTS_IMMUTABLE'); END;

INSERT OR IGNORE INTO processing_purposes(code,label,description,default_legal_basis,data_minimization_rule)
VALUES('daftar_book_controls','Digital Daftar book controls and Qarz case history','Protect closed reporting periods and maintain tenant-scoped append-only Qarz dispute history.','contract','Only authorized organization owners/admins can lock periods or manage cases; case notes are private and retained under organization policy.');
INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code) VALUES
('daftar_book_period_locks','company_id','CONFIDENTIAL','daftar_book_controls','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('daftar_book_period_locks','reason','CONFIDENTIAL','daftar_book_controls','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('daftar_qarz_cases','case_reason','CONFIDENTIAL','daftar_book_controls','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('daftar_qarz_cases','assigned_to_label','CONFIDENTIAL','daftar_book_controls','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1'),
('daftar_qarz_case_events','event_note','CONFIDENTIAL','daftar_book_controls','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');
