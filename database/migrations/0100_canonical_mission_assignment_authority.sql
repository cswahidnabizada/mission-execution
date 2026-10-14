-- ON Mission 10.42.0 — Canonical Mission Assignment Authority
-- One active execution assignment per mission. Legacy assignment fields/tables
-- remain as projections until all consumers are migrated and certified.
CREATE TABLE mission_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  assignment_type TEXT NOT NULL CHECK(assignment_type IN ('owner_driver','executor','tenant_driver')),
  assignee_type TEXT NOT NULL CHECK(assignee_type IN ('driver','executor')),
  assignee_id INTEGER NOT NULL,
  assignee_company_id INTEGER,
  request_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unassigned_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1,
  source_type TEXT NOT NULL DEFAULT 'canonical',
  source_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_mission_assignments_one_active
  ON mission_assignments(mission_id) WHERE status='active';
CREATE INDEX idx_mission_assignments_company_status
  ON mission_assignments(company_id,status,updated_at DESC,id DESC);
CREATE INDEX idx_mission_assignments_assignee
  ON mission_assignments(assignee_type,assignee_id,status,updated_at DESC);

CREATE TABLE mission_assignment_reconciliation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('reconciled','conflict','unassigned')),
  selected_source TEXT,
  selected_assignment_id INTEGER,
  legacy_driver_id INTEGER,
  legacy_executor_id INTEGER,
  legacy_tenant_driver_id INTEGER,
  conflict_json TEXT NOT NULL DEFAULT '{}',
  resolved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX idx_mission_assignment_reconciliation_mission
  ON mission_assignment_reconciliation(mission_id);

-- Deterministic backfill. A mission may have only one execution owner in the
-- canonical model. Executor > shared tenant driver > owner driver is the
-- migration precedence, while every multi-source case is explicitly recorded
-- as a conflict for certification instead of being silently discarded.
INSERT INTO mission_assignments(
  company_id,mission_id,assignment_type,assignee_type,assignee_id,assignee_company_id,
  request_id,status,assigned_at,created_at,updated_at,version,source_type,source_id,metadata_json
)
SELECT m.company_id,m.id,'executor','executor',mea.executor_id,m.company_id,mea.request_id,'active',mea.assigned_at,mea.created_at,mea.updated_at,1,'legacy_executor',CAST(mea.id AS TEXT),'{"backfilled":true}'
FROM missions m
JOIN mission_executor_assignments mea ON mea.mission_id=m.id AND mea.company_id=m.company_id AND mea.status='active'
WHERE NOT EXISTS (SELECT 1 FROM mission_assignments x WHERE x.mission_id=m.id AND x.status='active');

INSERT INTO mission_assignments(
  company_id,mission_id,assignment_type,assignee_type,assignee_id,assignee_company_id,
  status,assigned_at,created_at,updated_at,version,source_type,source_id,metadata_json
)
SELECT m.company_id,m.id,'tenant_driver','driver',mtda.driver_id,mtda.access_company_id,'active',mtda.assigned_at,mtda.assigned_at,mtda.updated_at,1,'legacy_tenant_driver',CAST(mtda.id AS TEXT),'{"backfilled":true}'
FROM missions m
JOIN mission_tenant_driver_assignments mtda ON mtda.mission_id=m.id AND mtda.owner_company_id=m.company_id
WHERE NOT EXISTS (SELECT 1 FROM mission_assignments x WHERE x.mission_id=m.id AND x.status='active');

INSERT INTO mission_assignments(
  company_id,mission_id,assignment_type,assignee_type,assignee_id,assignee_company_id,
  status,assigned_at,created_at,updated_at,version,source_type,source_id,metadata_json
)
SELECT m.company_id,m.id,'owner_driver','driver',m.driver_id,m.company_id,'active',m.updated_at,m.created_at,m.updated_at,1,'legacy_mission_driver',CAST(m.id AS TEXT),'{"backfilled":true}'
FROM missions m
WHERE m.driver_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM mission_assignments x WHERE x.mission_id=m.id AND x.status='active');

-- Record every mission's migration truth, including conflicts that require
-- controlled follow-up rather than silent precedence.
INSERT INTO mission_assignment_reconciliation(
  company_id,mission_id,status,selected_source,selected_assignment_id,
  legacy_driver_id,legacy_executor_id,legacy_tenant_driver_id,conflict_json
)
SELECT m.company_id,m.id,
  CASE WHEN ((CASE WHEN m.driver_id IS NOT NULL THEN 1 ELSE 0 END)
          +(CASE WHEN EXISTS(SELECT 1 FROM mission_executor_assignments e WHERE e.mission_id=m.id AND e.company_id=m.company_id AND e.status='active') THEN 1 ELSE 0 END)
          +(CASE WHEN EXISTS(SELECT 1 FROM mission_tenant_driver_assignments t WHERE t.mission_id=m.id AND t.owner_company_id=m.company_id) THEN 1 ELSE 0 END))>1 THEN 'conflict'
       WHEN ca.id IS NOT NULL THEN 'reconciled' ELSE 'unassigned' END,
  ca.source_type,ca.id,m.driver_id,
  (SELECT e.executor_id FROM mission_executor_assignments e WHERE e.mission_id=m.id AND e.company_id=m.company_id AND e.status='active' ORDER BY e.id DESC LIMIT 1),
  (SELECT t.driver_id FROM mission_tenant_driver_assignments t WHERE t.mission_id=m.id AND t.owner_company_id=m.company_id ORDER BY t.id DESC LIMIT 1),
  json_object('hasOwnerDriver',CASE WHEN m.driver_id IS NOT NULL THEN 1 ELSE 0 END,'hasExecutor',CASE WHEN EXISTS(SELECT 1 FROM mission_executor_assignments e WHERE e.mission_id=m.id AND e.company_id=m.company_id AND e.status='active') THEN 1 ELSE 0 END,'hasTenantDriver',CASE WHEN EXISTS(SELECT 1 FROM mission_tenant_driver_assignments t WHERE t.mission_id=m.id AND t.owner_company_id=m.company_id) THEN 1 ELSE 0 END)
FROM missions m
LEFT JOIN mission_assignments ca ON ca.mission_id=m.id AND ca.status='active';
