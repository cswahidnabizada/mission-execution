-- ON Mission 10.44.3 — Final Convergence & Certification Governance
-- Governance metadata only: no new operational authority is introduced.

CREATE TABLE IF NOT EXISTS platform_architecture_governance (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO platform_architecture_governance(key,value_json,status)
VALUES
 ('assignment_archive_policy','{"authority":"mission_assignments","archives":["mission_executor_assignments","mission_tenant_driver_assignments"],"disposition":"frozen_historical_archive","runtime_reads":false,"runtime_writes":false,"destructive_drop":"deferred_until_archive_retention_decision"}','active'),
 ('certification_model','{"required":["static","schema","integration","adversarial","real_journey","recovery"],"runtime_evidence_required":true,"no_evidence_means_no_certification":true}','active'),
 ('release_authority','{"source":"/VERSION","derived_metadata":true}','active')
ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,status=excluded.status,updated_at=CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_platform_architecture_governance_status
  ON platform_architecture_governance(status);
