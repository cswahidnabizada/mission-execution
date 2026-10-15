-- Mission Execution 16.10.14 — persistent objective orchestration foundation.
-- This stores orchestration state only; canonical mission/domain tables remain authoritative.
CREATE TABLE IF NOT EXISTS platform_objectives (
  objective_id TEXT PRIMARY KEY,
  objective_text TEXT NOT NULL CHECK(length(objective_text) BETWEEN 3 AND 1200),
  status TEXT NOT NULL CHECK(status IN ('DRAFT','PLANNED','RUNNING','WAITING_APPROVAL','BLOCKED','COMPLETED','FAILED','CANCELLED')) DEFAULT 'DRAFT',
  actor_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_platform_objectives_status_updated ON platform_objectives(status,updated_at DESC);

CREATE TABLE IF NOT EXISTS platform_objective_runs (
  run_id TEXT PRIMARY KEY,
  objective_id TEXT NOT NULL REFERENCES platform_objectives(objective_id),
  status TEXT NOT NULL CHECK(status IN ('PLANNED','RUNNING','WAITING_APPROVAL','BLOCKED','COMPLETED','FAILED','RECOVERY_REQUIRED','CANCELLED')) DEFAULT 'PLANNED',
  idempotency_key TEXT NOT NULL UNIQUE,
  plan_json TEXT NOT NULL,
  authority_snapshot_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  lease_token TEXT,
  lease_expires_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_platform_objective_runs_objective ON platform_objective_runs(objective_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_objective_runs_status ON platform_objective_runs(status,updated_at DESC);

CREATE TABLE IF NOT EXISTS platform_objective_steps (
  step_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES platform_objective_runs(run_id),
  ordinal INTEGER NOT NULL,
  step_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  authority_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PROPOSED','READY','AWAITING_APPROVAL','APPROVED','RUNNING','VERIFIED','BLOCKED','FAILED','RECOVERY_REQUIRED','SKIPPED')) DEFAULT 'PROPOSED',
  requires_approval INTEGER NOT NULL DEFAULT 0 CHECK(requires_approval IN (0,1)),
  evidence_json TEXT NOT NULL DEFAULT '[]',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(run_id,ordinal)
);
CREATE INDEX IF NOT EXISTS idx_platform_objective_steps_run ON platform_objective_steps(run_id,ordinal);
CREATE INDEX IF NOT EXISTS idx_platform_objective_steps_status ON platform_objective_steps(status,updated_at DESC);

CREATE TABLE IF NOT EXISTS platform_objective_approvals (
  approval_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES platform_objective_runs(run_id),
  step_id TEXT NOT NULL REFERENCES platform_objective_steps(step_id),
  status TEXT NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED','EXPIRED')) DEFAULT 'PENDING',
  requested_reason TEXT NOT NULL,
  decided_by TEXT,
  decision_reason TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TEXT,
  UNIQUE(step_id)
);
CREATE INDEX IF NOT EXISTS idx_platform_objective_approvals_status ON platform_objective_approvals(status,created_at DESC);

CREATE TABLE IF NOT EXISTS platform_objective_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  objective_id TEXT NOT NULL,
  run_id TEXT,
  step_id TEXT,
  event_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_platform_objective_events_run ON platform_objective_events(run_id,event_id DESC);
