-- Simulation run records are append-only evidence and are never production mission truth.
CREATE TABLE IF NOT EXISTS platform_simulation_runs (
  run_id TEXT PRIMARY KEY CHECK(length(run_id) BETWEEN 8 AND 100),
  owner_scope TEXT NOT NULL CHECK(owner_scope IN ('platform','tenant')),
  tenant_id INTEGER,
  actor_id TEXT NOT NULL CHECK(length(actor_id) BETWEEN 1 AND 160),
  scenario_id TEXT NOT NULL CHECK(length(scenario_id) BETWEEN 1 AND 80),
  scenario_version TEXT NOT NULL DEFAULT '1',
  executor_id TEXT NOT NULL CHECK(length(executor_id) BETWEEN 1 AND 80),
  status TEXT NOT NULL CHECK(status IN ('PASS','RECOVERED','BLOCKED','FAILED')),
  schema_version TEXT NOT NULL,
  run_json TEXT NOT NULL CHECK(length(run_json) BETWEEN 2 AND 1000000),
  content_sha256 TEXT NOT NULL CHECK(length(content_sha256)=64),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK((owner_scope='platform' AND tenant_id IS NULL) OR (owner_scope='tenant' AND tenant_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_platform_simulation_runs_scope_created ON platform_simulation_runs(owner_scope,tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_simulation_runs_scenario_created ON platform_simulation_runs(scenario_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_platform_simulation_runs_no_update BEFORE UPDATE ON platform_simulation_runs BEGIN SELECT RAISE(ABORT,'SIMULATION_RUNS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_platform_simulation_runs_no_delete BEFORE DELETE ON platform_simulation_runs BEGIN SELECT RAISE(ABORT,'SIMULATION_RUNS_IMMUTABLE'); END;
