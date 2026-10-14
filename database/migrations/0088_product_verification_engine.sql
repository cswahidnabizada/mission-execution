-- ON Mission 10.38.15 — Product Verification Engine
-- Verification evidence is a controlled proof record. It never becomes runtime Truth,
-- authorization, lifecycle authority, or a parallel business engine.
CREATE TABLE IF NOT EXISTS platform_product_verification_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_key TEXT NOT NULL UNIQUE,
  operation_id INTEGER,
  idempotency_key TEXT,
  country_code TEXT NOT NULL,
  sector_code TEXT NOT NULL,
  launch_id INTEGER,
  launch_version TEXT,
  company_id INTEGER,
  mission_id INTEGER,
  mode TEXT NOT NULL DEFAULT 'controlled' CHECK(mode IN ('observational','controlled')),
  status TEXT NOT NULL DEFAULT 'preparing' CHECK(status IN ('preparing','executing','verifying','succeeded','failed','blocked')),
  journey_count INTEGER NOT NULL DEFAULT 0,
  passed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  blocked_count INTEGER NOT NULL DEFAULT 0,
  result_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(operation_id) REFERENCES platform_admin_operations(id) ON DELETE SET NULL,
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE SET NULL,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_product_verification_idempotency
ON platform_product_verification_runs(country_code,sector_code,COALESCE(company_id,0),idempotency_key)
WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_platform_product_verification_scope
ON platform_product_verification_runs(country_code,sector_code,company_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_platform_product_verification_status
ON platform_product_verification_runs(status,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_platform_product_verification_launch
ON platform_product_verification_runs(launch_id,launch_version,created_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS platform_product_verification_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  journey_code TEXT NOT NULL,
  step_code TEXT NOT NULL,
  authority TEXT NOT NULL,
  proof_kind TEXT NOT NULL CHECK(proof_kind IN ('configuration','runtime','user_state','canonical_action','transition','evidence')),
  status TEXT NOT NULL DEFAULT 'executing' CHECK(status IN ('executing','passed','failed','blocked','skipped')),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(run_id,sequence),
  UNIQUE(run_id,journey_code,step_code),
  FOREIGN KEY(run_id) REFERENCES platform_product_verification_runs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_platform_product_verification_steps_run
ON platform_product_verification_steps(run_id,sequence);
CREATE INDEX IF NOT EXISTS idx_platform_product_verification_steps_status
ON platform_product_verification_steps(status,created_at DESC,id DESC);
