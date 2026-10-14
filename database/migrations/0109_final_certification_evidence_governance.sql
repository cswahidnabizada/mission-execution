-- ON Mission 10.44.3 — Final Certification Evidence Governance
-- Evidence registry only. This table does not own product, mission, lifecycle,
-- assignment, authorization, or operational truth.

CREATE TABLE IF NOT EXISTS platform_certification_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_key TEXT NOT NULL,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('static','schema','integration','adversarial','real_journey','recovery')),
  status TEXT NOT NULL CHECK (status IN ('pending','passed','failed','blocked')),
  environment TEXT NOT NULL DEFAULT 'unknown',
  evidence_json TEXT NOT NULL DEFAULT '{}',
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(run_key,evidence_type)
);

CREATE INDEX IF NOT EXISTS idx_platform_certification_evidence_run
  ON platform_certification_evidence(run_key,evidence_type,status);

CREATE TABLE IF NOT EXISTS platform_archive_governance (
  archive_key TEXT PRIMARY KEY,
  authority_table TEXT NOT NULL,
  archive_tables_json TEXT NOT NULL DEFAULT '[]',
  runtime_reads INTEGER NOT NULL DEFAULT 0 CHECK (runtime_reads IN (0,1)),
  runtime_writes INTEGER NOT NULL DEFAULT 0 CHECK (runtime_writes IN (0,1)),
  retention_decision TEXT NOT NULL CHECK (retention_decision IN ('pending','retain','purge_after_legal_review')),
  legal_hold_supported INTEGER NOT NULL DEFAULT 1 CHECK (legal_hold_supported IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO platform_archive_governance(
  archive_key,authority_table,archive_tables_json,runtime_reads,runtime_writes,retention_decision,legal_hold_supported
) VALUES (
  'assignment_history',
  'mission_assignments',
  '["mission_executor_assignments","mission_tenant_driver_assignments"]',
  0,0,'pending',1
)
ON CONFLICT(archive_key) DO UPDATE SET
  authority_table=excluded.authority_table,
  archive_tables_json=excluded.archive_tables_json,
  runtime_reads=excluded.runtime_reads,
  runtime_writes=excluded.runtime_writes,
  legal_hold_supported=excluded.legal_hold_supported,
  updated_at=CURRENT_TIMESTAMP;
