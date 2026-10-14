-- ON Mission 10.52.0 — controlled Product Test Lab scenario preparation.
-- This is orchestration metadata only. Live execution remains owned by Product Verification Engine.
CREATE TABLE IF NOT EXISTS platform_product_test_scenarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  launch_id INTEGER NOT NULL,
  company_id INTEGER,
  mission_id INTEGER,
  sector_code TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','blocked','prepared','consumed','superseded')),
  scenario_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE CASCADE,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_test_scenario_launch ON platform_product_test_scenarios(launch_id);
CREATE INDEX IF NOT EXISTS idx_product_test_scenario_status ON platform_product_test_scenarios(status,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_product_test_scenario_target ON platform_product_test_scenarios(company_id,mission_id);

CREATE TABLE IF NOT EXISTS platform_product_test_scenario_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_id INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  phase_code TEXT NOT NULL,
  label TEXT NOT NULL,
  journeys_json TEXT NOT NULL DEFAULT '[]',
  preconditions_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','blocked','completed','skipped')),
  evidence_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(scenario_id,sequence),
  UNIQUE(scenario_id,phase_code),
  FOREIGN KEY(scenario_id) REFERENCES platform_product_test_scenarios(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_product_test_scenario_steps_status ON platform_product_test_scenario_steps(status,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_product_test_scenario_steps_scenario ON platform_product_test_scenario_steps(scenario_id,sequence);

INSERT OR IGNORE INTO data_classification_registry(table_name,column_name,classification,purpose_code,retention_policy_code,export_allowed,audit_required,jurisdiction_policy_code)
VALUES('platform_product_test_scenarios','scenario_json','INTERNAL','product_configuration','DE_COMPLIANCE_REVIEW',0,1,'DE-GDPR-1');
