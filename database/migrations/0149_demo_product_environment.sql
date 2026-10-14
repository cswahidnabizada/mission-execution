-- ON Mission 15.2.0 — Governed Demo Product Environment
-- Demo classification is canonical environment metadata; it never replaces tenant,
-- identity, mission, assignment, authorization, evidence or execution authorities.
CREATE TABLE IF NOT EXISTS platform_environment_profiles (
  company_id INTEGER PRIMARY KEY,
  environment_code TEXT NOT NULL CHECK(environment_code IN ('PRODUCTION','DEMO','TEST','CERTIFICATION')),
  product_code TEXT NOT NULL DEFAULT 'on_mission',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','QUARANTINED','EXPIRED','SUSPENDED')),
  side_effect_policy_code TEXT NOT NULL DEFAULT 'REAL_OPERATIONAL_EFFECTS',
  scenario_code TEXT,
  expires_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by_type TEXT,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_environment_profiles_code_status ON platform_environment_profiles(environment_code,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_environment_profiles_scenario ON platform_environment_profiles(scenario_code,status);

CREATE TABLE IF NOT EXISTS demo_scenario_instances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  scenario_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'READY' CHECK(status IN ('READY','RUNNING','COMPLETED','RESET','FAILED')),
  blueprint_version TEXT NOT NULL DEFAULT '1',
  mission_id INTEGER,
  seed_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT,
  completed_at TEXT,
  reset_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_demo_scenario_company_status ON demo_scenario_instances(company_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_demo_scenario_mission ON demo_scenario_instances(mission_id,status);

CREATE TABLE IF NOT EXISTS demo_execution_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_instance_id INTEGER NOT NULL,
  company_id INTEGER NOT NULL,
  mission_id INTEGER,
  sequence INTEGER NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('READY','RUNNING','SIMULATED','VERIFIED','BLOCKED')),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(scenario_instance_id,sequence),
  FOREIGN KEY(scenario_instance_id) REFERENCES demo_scenario_instances(id) ON DELETE CASCADE,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_demo_execution_events_company_mission ON demo_execution_events(company_id,mission_id,sequence);
