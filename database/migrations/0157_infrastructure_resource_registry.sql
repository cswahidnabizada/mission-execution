-- Mission Execution 16.10.11 — governed infrastructure resource registry.
-- Registry records describe intended/observed resources; they never provision or switch provider resources.
CREATE TABLE IF NOT EXISTS platform_infrastructure_resources (
  resource_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 2 AND 120),
  resource_type TEXT NOT NULL CHECK(resource_type IN ('D1_DATABASE','R2_BUCKET','KV_NAMESPACE','VECTORIZE_INDEX','AI_SERVICE','WORKER','OTHER')),
  provider_code TEXT NOT NULL CHECK(length(provider_code) BETWEEN 2 AND 40),
  environment_scope TEXT NOT NULL CHECK(environment_scope IN ('production','development','shared')),
  owner_capability TEXT NOT NULL CHECK(length(owner_capability) BETWEEN 2 AND 100),
  jurisdiction_code TEXT NOT NULL CHECK(length(jurisdiction_code) BETWEEN 2 AND 16),
  provider_reference TEXT NOT NULL CHECK(length(provider_reference) BETWEEN 2 AND 240),
  schema_version TEXT,
  lifecycle_state TEXT NOT NULL DEFAULT 'PROPOSED' CHECK(lifecycle_state IN ('PROPOSED','VALIDATED','ACTIVE','DEGRADED','RETIRED')),
  evidence_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(evidence_json)),
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 8 AND 500),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_infra_resources_environment ON platform_infrastructure_resources(environment_scope,lifecycle_state,resource_type);
CREATE INDEX IF NOT EXISTS idx_infra_resources_owner ON platform_infrastructure_resources(owner_capability,lifecycle_state);
CREATE TABLE IF NOT EXISTS platform_infrastructure_resource_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  resource_id TEXT NOT NULL REFERENCES platform_infrastructure_resources(resource_id),
  event_type TEXT NOT NULL CHECK(event_type IN ('PROPOSED','VALIDATED','ACTIVATED','DEGRADED','RETIRED','EVIDENCE_ADDED')),
  from_state TEXT,
  to_state TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(evidence_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_infra_resource_events_resource ON platform_infrastructure_resource_events(resource_id,event_id DESC);

-- Replace the obsolete development-isolation release blocker with a neutral environment-boundary task.
-- Production data and evidence are retained; only the roadmap key/description and stale dependencies change.
UPDATE platform_infrastructure_roadmap
SET task_key='environment-boundaries',
    title='Define environment deployment boundaries',
    workstream='ENVIRONMENTS',
    description='Document and verify the approved environment model, independent credentials/resources, and safe promotion boundaries. This task does not block production releases unless a concrete production dependency requires it.',
    updated_at=CURRENT_TIMESTAMP
WHERE task_key='dev-isolation';
UPDATE platform_infrastructure_roadmap
SET depends_on_json=CASE
  WHEN task_key IN ('prod-eu-d1','prod-release-pipeline') THEN '[]'
  ELSE REPLACE(depends_on_json,'"dev-isolation"','"environment-boundaries"')
END,
updated_at=CURRENT_TIMESTAMP
WHERE depends_on_json LIKE '%dev-isolation%' OR task_key IN ('prod-eu-d1','prod-release-pipeline');
