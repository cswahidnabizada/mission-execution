-- ON Mission 15.4.0 — Certification Environment + Execution Boundary Hardening
-- Certification is a governed fixture over canonical country/product/tenant/identity authorities.
-- It never becomes a second mission or execution authority.

ALTER TABLE demo_scenario_instances ADD COLUMN current_sequence INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_demo_scenario_current_sequence
  ON demo_scenario_instances(company_id,status,current_sequence,updated_at DESC);

CREATE TABLE IF NOT EXISTS platform_certification_fixtures (
  fixture_code TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  product_key TEXT NOT NULL,
  product_definition_id INTEGER,
  tenant_a_id INTEGER,
  tenant_b_id INTEGER,
  status TEXT NOT NULL DEFAULT 'READY' CHECK(status IN ('READY','RESETTING','FAILED','RETIRED')),
  version TEXT NOT NULL DEFAULT '1',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_a_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY(tenant_b_id) REFERENCES companies(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_certification_fixture_status
  ON platform_certification_fixtures(status,updated_at DESC);

CREATE TABLE IF NOT EXISTS platform_certification_fixture_users (
  fixture_code TEXT NOT NULL,
  tenant_key TEXT NOT NULL CHECK(tenant_key IN ('A','B')),
  identity_id INTEGER NOT NULL,
  role_code TEXT NOT NULL,
  login TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(fixture_code,identity_id),
  FOREIGN KEY(identity_id) REFERENCES auth_identities(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_certification_fixture_users_login
  ON platform_certification_fixture_users(fixture_code,login);

-- A platform-owned simulation provider. It has no network endpoint and can only
-- be dispatched through an execution intent in TEST/CERTIFICATION.
INSERT OR IGNORE INTO external_provider_registry
(code,name,provider_type,endpoint,country_code,jurisdiction_code,region_code,residency_mode,transfer_mechanism,contract_status,active,version)
VALUES
('onmission-cert-sandbox','ON Mission Certification Sandbox','internal',NULL,'DE','DE-POLICY-1','DE','required','none','approved',1,'1');

INSERT OR IGNORE INTO external_provider_capabilities
(provider_code,capability_code,action_code,adapter_type,execute_path,execute_method,verify_path,verify_method,request_fields_json,verification_required,verification_success_values_json,timeout_ms,active,version,metadata_json)
VALUES
('onmission-cert-sandbox','certification-simulated-effect','confirm_delivery','in_app','/__internal/simulated','POST',NULL,'GET','["missionId","companyId","actionCode","idempotencyKey","executionIntentId","payload"]',1,'[true,"VERIFIED","SUCCEEDED","SUCCESS"]',1000,1,'1','{"simulationOnly":true,"fixtureCode":"ONM-CERT-DE-15"}');
