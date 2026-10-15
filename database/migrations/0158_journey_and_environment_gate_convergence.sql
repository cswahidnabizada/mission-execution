-- Mission Execution 16.10.12 — journey certification and environment gate convergence.
-- This repairs the persisted roadmap state without changing production bindings or data.
-- Environment design is tracked as an explicit boundary contract, not an assumed
-- prerequisite that blocks all production work merely because dev isolation is unfinished.
UPDATE platform_infrastructure_roadmap
SET task_key='environment-boundaries',
    title='Define approved environment boundaries',
    workstream='ENVIRONMENTS',
    description='Record the approved deployment-target model and verify each target’s own credentials, bindings, data scope and promotion controls. Do not infer isolation or residency from labels alone.',
    updated_at=CURRENT_TIMESTAMP
WHERE task_key='dev-isolation';

-- Idempotently ensure the replacement task exists even if an earlier migration ran
-- against a database where the legacy row was missing or had already been removed.
INSERT OR IGNORE INTO platform_infrastructure_roadmap
  (task_key,title,workstream,description,status,priority,depends_on_json,owner_label)
VALUES
  ('environment-boundaries','Define approved environment boundaries','ENVIRONMENTS',
   'Record the approved deployment-target model and verify each target’s own credentials, bindings, data scope and promotion controls. Do not infer isolation or residency from labels alone.',
   'NOT_STARTED','HIGH','[]','Platform Engineering');

-- Remove only the obsolete generic blocker. Concrete production prerequisites
-- (residency, backups, market certification and release controls) remain intact.
UPDATE platform_infrastructure_roadmap
SET depends_on_json=CASE
  WHEN task_key IN ('prod-eu-d1','prod-release-pipeline') THEN '[]'
  ELSE REPLACE(depends_on_json,'"dev-isolation"','"environment-boundaries"')
END,
updated_at=CURRENT_TIMESTAMP
WHERE depends_on_json LIKE '%dev-isolation%'
   OR task_key IN ('prod-eu-d1','prod-release-pipeline');
