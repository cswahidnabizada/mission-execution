-- ON Mission 13.4.0 — Mission Assignment Capability + Subject Governance
-- Assignment truth remains owned by mission_assignments / mission-assignment-authority.
-- This migration expands the existing authority to govern humans, devices and robots.
-- It does NOT create a second assignment authority or execution engine.

CREATE TABLE mission_assignment_subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  subject_type TEXT NOT NULL CHECK(subject_type IN ('human','device','robot')),
  subject_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  source_authority TEXT NOT NULL,
  source_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','verified','blocked','retired')),
  capability_codes_json TEXT NOT NULL DEFAULT '[]',
  constraints_json TEXT NOT NULL DEFAULT '{}',
  location_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  last_observed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(company_id,subject_type,subject_key)
);
CREATE INDEX idx_mission_assignment_subjects_company_status
  ON mission_assignment_subjects(company_id,subject_type,status,updated_at DESC,id DESC);
CREATE INDEX idx_mission_assignment_subjects_source
  ON mission_assignment_subjects(source_authority,source_id,status);

CREATE TABLE mission_assignment_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  decision_type TEXT NOT NULL CHECK(decision_type IN ('ASSIGN','REASSIGN','SHARE','WAIT','ESCALATE')),
  target_type TEXT,
  target_id INTEGER,
  score REAL,
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'RECOMMENDED' CHECK(status IN ('RECOMMENDED','ACCEPTED','REJECTED','EXPIRED','SUPERSEDED')),
  reason_json TEXT NOT NULL DEFAULT '{}',
  context_json TEXT NOT NULL DEFAULT '{}',
  created_by_type TEXT NOT NULL DEFAULT 'mission_assignment_capability',
  created_by_id TEXT,
  accepted_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);
CREATE INDEX idx_mission_assignment_decisions_mission
  ON mission_assignment_decisions(company_id,mission_id,status,created_at DESC,id DESC);
CREATE INDEX idx_mission_assignment_decisions_target
  ON mission_assignment_decisions(target_type,target_id,status,created_at DESC);

-- SQLite/D1 CHECK constraints are immutable. Rebuild the existing canonical table
-- so the same authority can represent driver/executor/device/robot subjects.
DROP VIEW IF EXISTS mission_active_assignment_projection;
DROP TRIGGER IF EXISTS trg_mission_assignments_integrity_insert;
DROP TRIGGER IF EXISTS trg_mission_assignments_integrity_update;
DROP TRIGGER IF EXISTS trg_mission_assignments_scope_hardening_insert;
DROP TRIGGER IF EXISTS trg_mission_assignments_scope_hardening_update;

ALTER TABLE mission_assignments RENAME TO mission_assignments_legacy_v142;

CREATE TABLE mission_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  assignment_type TEXT NOT NULL CHECK(assignment_type IN ('owner_driver','executor','tenant_driver')),
  assignee_type TEXT NOT NULL CHECK(assignee_type IN ('driver','executor','device','robot')),
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

INSERT INTO mission_assignments(
  id,company_id,mission_id,assignment_type,assignee_type,assignee_id,assignee_company_id,request_id,status,
  assigned_at,unassigned_at,created_at,updated_at,version,source_type,source_id,metadata_json
)
SELECT id,company_id,mission_id,assignment_type,assignee_type,assignee_id,assignee_company_id,request_id,status,
  assigned_at,unassigned_at,created_at,updated_at,version,source_type,source_id,metadata_json
FROM mission_assignments_legacy_v142;

DROP TABLE mission_assignments_legacy_v142;

CREATE UNIQUE INDEX idx_mission_assignments_one_active
  ON mission_assignments(mission_id) WHERE status='active';
CREATE INDEX idx_mission_assignments_company_status
  ON mission_assignments(company_id,status,updated_at DESC,id DESC);
CREATE INDEX idx_mission_assignments_company_mission_status
  ON mission_assignments(company_id,mission_id,status,updated_at DESC,id DESC);
CREATE INDEX idx_mission_assignments_assignee
  ON mission_assignments(assignee_type,assignee_id,status,updated_at DESC);

CREATE VIEW mission_active_assignment_projection AS
SELECT id,company_id,mission_id,assignment_type,assignee_type,assignee_id,assignee_company_id,request_id,status,
       assigned_at,updated_at,version,source_type,source_id,metadata_json
FROM mission_assignments WHERE status='active';

CREATE TRIGGER trg_mission_assignments_integrity_insert
BEFORE INSERT ON mission_assignments
WHEN NOT EXISTS (
  SELECT 1 FROM missions m WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
OR (NEW.assignee_type='driver' AND NOT EXISTS (
  SELECT 1 FROM drivers d WHERE d.id=NEW.assignee_id AND (NEW.assignee_company_id IS NULL OR d.company_id=NEW.assignee_company_id)
))
OR (NEW.assignee_type='executor' AND NOT EXISTS (
  SELECT 1 FROM public_executor_identities e WHERE e.id=NEW.assignee_id AND e.deleted_at IS NULL
))
OR (NEW.assignee_type IN ('device','robot') AND NOT EXISTS (
  SELECT 1 FROM mission_assignment_subjects s
  WHERE s.id=NEW.assignee_id AND s.company_id=NEW.company_id AND s.subject_type=NEW.assignee_type
    AND s.status='verified'
))
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission assignment integrity failure');
END;

CREATE TRIGGER trg_mission_assignments_integrity_update
BEFORE UPDATE OF company_id,mission_id,assignee_type,assignee_id,assignee_company_id ON mission_assignments
WHEN NOT EXISTS (
  SELECT 1 FROM missions m WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
OR (NEW.assignee_type='driver' AND NOT EXISTS (
  SELECT 1 FROM drivers d WHERE d.id=NEW.assignee_id AND (NEW.assignee_company_id IS NULL OR d.company_id=NEW.assignee_company_id)
))
OR (NEW.assignee_type='executor' AND NOT EXISTS (
  SELECT 1 FROM public_executor_identities e WHERE e.id=NEW.assignee_id AND e.deleted_at IS NULL
))
OR (NEW.assignee_type IN ('device','robot') AND NOT EXISTS (
  SELECT 1 FROM mission_assignment_subjects s
  WHERE s.id=NEW.assignee_id AND s.company_id=NEW.company_id AND s.subject_type=NEW.assignee_type
    AND s.status='verified'
))
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission assignment integrity failure');
END;

CREATE TRIGGER trg_mission_assignments_scope_hardening_insert
BEFORE INSERT ON mission_assignments
WHEN
  (NEW.assignee_type='driver' AND NEW.assignment_type='owner_driver' AND (
    NEW.assignee_company_id IS NULL OR NEW.assignee_company_id<>NEW.company_id OR NOT EXISTS (
      SELECT 1 FROM drivers d WHERE d.id=NEW.assignee_id AND d.company_id=NEW.company_id
    )
  ))
  OR
  (NEW.assignee_type='driver' AND NEW.assignment_type='tenant_driver' AND (
    NEW.assignee_company_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM drivers d WHERE d.id=NEW.assignee_id AND d.company_id=NEW.assignee_company_id
    ) OR NOT EXISTS (
      SELECT 1 FROM mission_tenant_access a
      WHERE a.mission_id=NEW.mission_id AND a.owner_company_id=NEW.company_id
        AND a.access_company_id=NEW.assignee_company_id AND a.status='active'
    )
  ))
  OR
  (NEW.assignee_type IN ('device','robot') AND (
    NEW.assignment_type<>'executor' OR NEW.assignee_company_id<>NEW.company_id
  ))
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: canonical assignment scope mismatch');
END;

CREATE TRIGGER trg_mission_assignments_scope_hardening_update
BEFORE UPDATE OF company_id,mission_id,assignment_type,assignee_type,assignee_id,assignee_company_id ON mission_assignments
WHEN
  (NEW.assignee_type='driver' AND NEW.assignment_type='owner_driver' AND (
    NEW.assignee_company_id IS NULL OR NEW.assignee_company_id<>NEW.company_id OR NOT EXISTS (
      SELECT 1 FROM drivers d WHERE d.id=NEW.assignee_id AND d.company_id=NEW.company_id
    )
  ))
  OR
  (NEW.assignee_type='driver' AND NEW.assignment_type='tenant_driver' AND (
    NEW.assignee_company_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM drivers d WHERE d.id=NEW.assignee_id AND d.company_id=NEW.assignee_company_id
    ) OR NOT EXISTS (
      SELECT 1 FROM mission_tenant_access a
      WHERE a.mission_id=NEW.mission_id AND a.owner_company_id=NEW.company_id
        AND a.access_company_id=NEW.assignee_company_id AND a.status='active'
    )
  ))
  OR
  (NEW.assignee_type IN ('device','robot') AND (
    NEW.assignment_type<>'executor' OR NEW.assignee_company_id<>NEW.company_id
  ))
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: canonical assignment scope mismatch');
END;

-- Assignment is the single execution owner. A robot/device is an execution subject,
-- not a new mission truth authority and not a second lifecycle writer.

INSERT OR IGNORE INTO canonical_capability_registry(code,label,domain_code,description,status,version)
VALUES('mission_assignment','Mission Assignment','platform','Understands mission context and governs safe execution assignment across humans, devices and robots.', 'active','13.4.0');

INSERT OR IGNORE INTO canonical_capability_contracts
(capability_code,version,purpose,inputs_json,outputs_json,commands_json,queries_json,resource_types_json,risk_class,tenant_scope,side_effects_json,dependencies_json,preconditions_json,postconditions_json,failure_contract_json,verification_contract_json,recovery_contract_json,health_contract_json,observability_json)
VALUES
('mission_assignment','1','Understands mission context and governs safe assignment of a single execution owner or proposes a governed sharing/reassignment path','["mission","situation","readiness","responsibility","candidates","policy"]','["assignment_decision","assignment","assignment_candidates"]','["read_assignment","list_candidates","recommend_assignment","assign_mission","reassign_mission","share_mission","escalate_assignment"]','["read_assignment","list_candidates","read_assignment_decisions"]','["mission","assignment","assignment_subject","people","resource"]','critical','tenant','["assignment"]','["mission_truth","responsibility","readiness","authorization","resource_governance"]','["current_truth","assignment_subjects_verified","canonical_dependencies_readable"]','["one_active_execution_assignment_or_explicit_wait"]','{"conflict":"409","unknown_candidate":"DEFER","canonical_unavailable":"503","stale":"409"}','{"required":"assignment_decision_evidence","required_for_effect":"canonical_assignment_write"}','{"strategy":"reassess_before_reassignment","unknown":"do_not_auto_assign"}','{"required":"assignment_authority"}','{"decision_id":true,"context_hash":true,"candidate_evidence":true}');

INSERT OR IGNORE INTO platform_control_plane_resource_contracts
(resource_type,resource_key,label,authority_code,governance_version,metadata_json,owner_capability,risk_class,step_up_required,identity_rule,lifecycle_json,provenance_json,consumer_scope_json,version)
VALUES
('assignment_subject','*','Mission assignment subjects','mission_assignment_authority','13.4.0','{"contract":"assignment_subject","truth":"identity_projection_only"}','mission_assignment','high',1,'company_id:subject_type:subject_key','{"states":["pending","verified","blocked","retired"]}','{"source":"declared_source_authority","freshness_required":true}','{"capabilities":["mission_assignment","resource_governance"],"tenantScope":"tenant"}','1');

