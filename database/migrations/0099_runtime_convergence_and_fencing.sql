-- ON Mission 10.41.1 — Runtime Convergence, Fencing & Lifecycle Binding Hardening
-- Safe follow-up migration for 10.41.0. No application authority is weakened.

-- Administrative operation fencing: stale workers must not complete a lease they no longer own.
ALTER TABLE platform_admin_operations ADD COLUMN lease_token TEXT;
ALTER TABLE platform_admin_operations ADD COLUMN lease_version INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_admin_operation_lease_token
ON platform_admin_operations(lease_token) WHERE lease_token IS NOT NULL;

-- Data-entry commit recovery state. Existing rows remain compatible.
ALTER TABLE platform_data_entry_records ADD COLUMN commit_recovery_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE platform_data_entry_records ADD COLUMN commit_attempt INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_platform_data_entry_commit_recovery
ON platform_data_entry_records(status,commit_started_at,commit_recovery_status);

-- 10.41.0 accidentally made lifecycle binding history impossible by using
-- UNIQUE(launch_id,sector_code). Rebuild the small binding table so history is
-- retained while the database enforces exactly one active binding per launch+sector.
CREATE TABLE platform_product_sector_lifecycles_v101 AS SELECT * FROM platform_product_sector_lifecycles WHERE 0;
DROP TABLE platform_product_sector_lifecycles;
CREATE TABLE platform_product_sector_lifecycles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  launch_id INTEGER NOT NULL,
  product_definition_id INTEGER,
  sector_code TEXT NOT NULL,
  lifecycle_definition_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','validated','active','retired')),
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  effective_at TEXT,
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE CASCADE,
  FOREIGN KEY(product_definition_id) REFERENCES platform_product_definitions(id) ON DELETE SET NULL,
  FOREIGN KEY(lifecycle_definition_id) REFERENCES platform_lifecycle_definitions(id)
);
INSERT INTO platform_product_sector_lifecycles
(id,launch_id,product_definition_id,sector_code,lifecycle_definition_id,status,active,effective_at,created_by_type,created_by_id,created_at,updated_at)
SELECT id,launch_id,product_definition_id,sector_code,lifecycle_definition_id,status,active,effective_at,created_by_type,created_by_id,created_at,updated_at
FROM platform_product_sector_lifecycles_v101;
DROP TABLE platform_product_sector_lifecycles_v101;
CREATE INDEX IF NOT EXISTS idx_product_sector_lifecycle_lookup
ON platform_product_sector_lifecycles(launch_id,sector_code,status,active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_sector_lifecycle_active
ON platform_product_sector_lifecycles(launch_id,sector_code) WHERE active=1;

-- Cancellation remains a governed lifecycle transition, including post-assignment
-- operational states where a business owner is allowed to terminate the mission.
INSERT OR IGNORE INTO platform_lifecycle_transitions(lifecycle_definition_id,from_state_code,to_state_code,transition_code,action_code,reason_code,required_role_codes_json)
SELECT id,'ARRIVED','CANCELLED','CANCEL_ARRIVED','cancel_mission','owner_archived','["admin"]' FROM platform_lifecycle_definitions WHERE lifecycle_key='logistics.default' AND version=1;
INSERT OR IGNORE INTO platform_lifecycle_transitions(lifecycle_definition_id,from_state_code,to_state_code,transition_code,action_code,reason_code,required_role_codes_json)
SELECT id,'PICKED_UP','CANCELLED','CANCEL_PICKED_UP','cancel_mission','owner_archived','["admin"]' FROM platform_lifecycle_definitions WHERE lifecycle_key='logistics.default' AND version=1;
INSERT OR IGNORE INTO platform_lifecycle_transitions(lifecycle_definition_id,from_state_code,to_state_code,transition_code,action_code,reason_code,required_role_codes_json)
SELECT id,'IN_TRANSIT','CANCELLED','CANCEL_IN_TRANSIT','cancel_mission','owner_archived','["admin"]' FROM platform_lifecycle_definitions WHERE lifecycle_key='logistics.default' AND version=1;
INSERT OR IGNORE INTO platform_lifecycle_transitions(lifecycle_definition_id,from_state_code,to_state_code,transition_code,action_code,reason_code,required_role_codes_json)
SELECT id,'DELIVERED','CANCELLED','CANCEL_DELIVERED','cancel_mission','owner_archived','["admin"]' FROM platform_lifecycle_definitions WHERE lifecycle_key='logistics.default' AND version=1;
INSERT OR IGNORE INTO platform_lifecycle_transitions(lifecycle_definition_id,from_state_code,to_state_code,transition_code,action_code,reason_code,required_role_codes_json)
SELECT id,'IN_PROGRESS','CANCELLED','CANCEL_IN_PROGRESS','cancel_work','owner_archived','["admin"]' FROM platform_lifecycle_definitions WHERE lifecycle_key='general.default' AND version=1;

-- Historical mission truth must not be deleted indirectly by company/mission
-- parent deletion. Rebuild normalized operational-history tables with RESTRICTed
-- parent references; governed disposition remains the only destructive authority.
CREATE TABLE mission_stops_v101 AS SELECT * FROM mission_stops WHERE 0;
CREATE TABLE mission_objects_v101 AS SELECT * FROM mission_objects WHERE 0;
CREATE TABLE mission_assignment_events_v101 AS SELECT * FROM mission_assignment_events WHERE 0;
CREATE TABLE mission_custody_events_v101 AS SELECT * FROM mission_custody_events WHERE 0;
CREATE TABLE mission_evidence_events_v101 AS SELECT * FROM mission_evidence_events WHERE 0;
DROP TABLE mission_stops; DROP TABLE mission_objects; DROP TABLE mission_assignment_events; DROP TABLE mission_custody_events; DROP TABLE mission_evidence_events;
CREATE TABLE mission_stops (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, mission_id INTEGER NOT NULL, sequence_no INTEGER NOT NULL,
  stop_type TEXT NOT NULL CHECK(stop_type IN ('pickup','intermediate','delivery','other')), status TEXT NOT NULL DEFAULT 'pending',
  company_name TEXT, contact_name TEXT, contact_phone TEXT, address_line1 TEXT, address_line2 TEXT, postal_code TEXT, city TEXT, region TEXT,
  latitude REAL, longitude REAL, access_from TEXT, access_to TEXT, planned_arrival_at TEXT, planned_departure_at TEXT,
  estimated_arrival_at TEXT, actual_arrival_at TEXT, actual_departure_at TEXT, instructions TEXT,
  evidence_required INTEGER NOT NULL DEFAULT 0 CHECK(evidence_required IN (0,1)), state_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(mission_id,sequence_no), FOREIGN KEY(company_id) REFERENCES companies(id), FOREIGN KEY(mission_id) REFERENCES missions(id)
);
CREATE TABLE mission_objects (
  id INTEGER PRIMARY KEY AUTOINCREMENT, company_id INTEGER NOT NULL, mission_id INTEGER NOT NULL, sequence_no INTEGER NOT NULL DEFAULT 1,
  object_type TEXT NOT NULL, description TEXT, weight_kg REAL, volume_m3 REAL, pallet_count INTEGER,
  identifiers_json TEXT NOT NULL DEFAULT '[]', requirements_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(mission_id,sequence_no), FOREIGN KEY(company_id) REFERENCES companies(id), FOREIGN KEY(mission_id) REFERENCES missions(id)
);
CREATE TABLE mission_assignment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, mission_id INTEGER NOT NULL, company_id INTEGER NOT NULL, assignment_type TEXT NOT NULL,
  actor_type TEXT, actor_id INTEGER, driver_id INTEGER, executor_id INTEGER, event_code TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(mission_id) REFERENCES missions(id), FOREIGN KEY(company_id) REFERENCES companies(id)
);
CREATE TABLE mission_custody_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, mission_id INTEGER NOT NULL, company_id INTEGER NOT NULL, event_code TEXT NOT NULL,
  holder_type TEXT, holder_id INTEGER, target_type TEXT, target_id INTEGER, metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(mission_id) REFERENCES missions(id), FOREIGN KEY(company_id) REFERENCES companies(id)
);
CREATE TABLE mission_evidence_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, mission_id INTEGER NOT NULL, company_id INTEGER NOT NULL, file_id INTEGER,
  evidence_type TEXT NOT NULL, event_code TEXT NOT NULL, actor_type TEXT, actor_id INTEGER, metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(mission_id) REFERENCES missions(id), FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(file_id) REFERENCES mission_files(id) ON DELETE SET NULL
);
INSERT INTO mission_stops SELECT * FROM mission_stops_v101;
INSERT INTO mission_objects SELECT * FROM mission_objects_v101;
INSERT INTO mission_assignment_events SELECT * FROM mission_assignment_events_v101;
INSERT INTO mission_custody_events SELECT * FROM mission_custody_events_v101;
INSERT INTO mission_evidence_events SELECT * FROM mission_evidence_events_v101;
DROP TABLE mission_stops_v101; DROP TABLE mission_objects_v101; DROP TABLE mission_assignment_events_v101; DROP TABLE mission_custody_events_v101; DROP TABLE mission_evidence_events_v101;
CREATE INDEX IF NOT EXISTS idx_mission_stops_mission ON mission_stops(mission_id,sequence_no);
CREATE INDEX IF NOT EXISTS idx_mission_objects_mission ON mission_objects(mission_id,sequence_no);
CREATE INDEX IF NOT EXISTS idx_mission_assignment_events_mission ON mission_assignment_events(mission_id,created_at,id);
CREATE INDEX IF NOT EXISTS idx_mission_custody_events_mission ON mission_custody_events(mission_id,created_at,id);
CREATE INDEX IF NOT EXISTS idx_mission_evidence_events_mission ON mission_evidence_events(mission_id,created_at,id);
