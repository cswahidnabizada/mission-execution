-- ON Mission 10.41.0 — Canonical Sector Lifecycle & Logistics Domain Normalization
-- Lifecycle is a product/sector contract. The canonical core consumes it; it does not hard-code sector semantics.

CREATE TABLE IF NOT EXISTS platform_lifecycle_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lifecycle_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  country_code TEXT,
  sector_code TEXT NOT NULL,
  product_definition_id INTEGER,
  launch_id INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','validated','active','retired')),
  initial_state_code TEXT NOT NULL,
  terminal_states_json TEXT NOT NULL DEFAULT '[]',
  liveness_policy_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by_type TEXT NOT NULL,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lifecycle_key,version),
  FOREIGN KEY(country_code) REFERENCES country_catalog(code),
  FOREIGN KEY(product_definition_id) REFERENCES platform_product_definitions(id) ON DELETE SET NULL,
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS platform_lifecycle_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lifecycle_definition_id INTEGER NOT NULL,
  state_code TEXT NOT NULL,
  label TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'OPERATIONAL',
  terminal INTEGER NOT NULL DEFAULT 0 CHECK(terminal IN (0,1)),
  custody_active INTEGER NOT NULL DEFAULT 0 CHECK(custody_active IN (0,1)),
  sequence_no INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lifecycle_definition_id,state_code),
  FOREIGN KEY(lifecycle_definition_id) REFERENCES platform_lifecycle_definitions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS platform_lifecycle_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lifecycle_definition_id INTEGER NOT NULL,
  from_state_code TEXT NOT NULL,
  to_state_code TEXT NOT NULL,
  transition_code TEXT NOT NULL,
  action_code TEXT,
  reason_code TEXT,
  required_role_codes_json TEXT NOT NULL DEFAULT '[]',
  guard_json TEXT NOT NULL DEFAULT '{}',
  evidence_policy_json TEXT NOT NULL DEFAULT '{}',
  sequence_no INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lifecycle_definition_id,from_state_code,to_state_code),
  UNIQUE(lifecycle_definition_id,transition_code),
  FOREIGN KEY(lifecycle_definition_id) REFERENCES platform_lifecycle_definitions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS platform_product_sector_lifecycles (
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
  UNIQUE(launch_id,sector_code),
  FOREIGN KEY(launch_id) REFERENCES country_product_launches(id) ON DELETE CASCADE,
  FOREIGN KEY(product_definition_id) REFERENCES platform_product_definitions(id) ON DELETE SET NULL,
  FOREIGN KEY(lifecycle_definition_id) REFERENCES platform_lifecycle_definitions(id)
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_definitions_scope ON platform_lifecycle_definitions(country_code,sector_code,status,version DESC);
CREATE INDEX IF NOT EXISTS idx_lifecycle_states_definition ON platform_lifecycle_states(lifecycle_definition_id,sequence_no,state_code);
CREATE INDEX IF NOT EXISTS idx_lifecycle_transitions_definition ON platform_lifecycle_transitions(lifecycle_definition_id,from_state_code,sequence_no);
CREATE INDEX IF NOT EXISTS idx_product_sector_lifecycle_lookup ON platform_product_sector_lifecycles(launch_id,sector_code,status,active);

-- Database-level activation invariants. Older active rows are retired before the unique constraints are installed.
UPDATE country_product_launches
SET status='retired',active=0,updated_at=CURRENT_TIMESTAMP
WHERE active=1
  AND id NOT IN (SELECT MAX(id) FROM country_product_launches WHERE active=1 GROUP BY country_code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_country_product_launch_active
ON country_product_launches(country_code) WHERE active=1;

UPDATE platform_configuration_versions
SET status='retired',active=0,updated_at=CURRENT_TIMESTAMP
WHERE active=1
  AND id NOT IN (SELECT MAX(id) FROM platform_configuration_versions WHERE active=1 GROUP BY domain_code,config_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_configuration_active
ON platform_configuration_versions(domain_code,config_key) WHERE active=1;

-- Generic lifecycle contract used when a product/sector has not yet supplied a specialized definition.
INSERT OR IGNORE INTO platform_lifecycle_definitions
(lifecycle_key,name,description,country_code,sector_code,version,status,initial_state_code,terminal_states_json,liveness_policy_json,created_by_type,created_by_id)
VALUES
('logistics.default','Logistics Lifecycle','Canonical logistics lifecycle template. Product launches may clone and specialize this contract.',NULL,'logistics',1,'active','PENDING','["COMPLETED","CANCELLED"]','{"terminal_requires_no_next_action":true,"non_terminal_requires_next_action_or_waiting":true}','system','10.41.0'),
('general.default','General Operational Lifecycle','Generic sector-neutral lifecycle template. Product launches should specialize it for their sector.',NULL,'general',1,'active','CREATED','["COMPLETED","CANCELLED"]','{"terminal_requires_no_next_action":true,"non_terminal_requires_next_action_or_waiting":true}','system','10.41.0');

INSERT OR IGNORE INTO platform_lifecycle_states(lifecycle_definition_id,state_code,label,stage,terminal,custody_active,sequence_no)
SELECT id,'PENDING','Pending','PRE_CUSTODY',0,0,10 FROM platform_lifecycle_definitions WHERE lifecycle_key='logistics.default' AND version=1;
INSERT OR IGNORE INTO platform_lifecycle_states(lifecycle_definition_id,state_code,label,stage,terminal,custody_active,sequence_no)
SELECT id,'ARRIVED','Arrived','PRE_CUSTODY',0,0,20 FROM platform_lifecycle_definitions WHERE lifecycle_key='logistics.default' AND version=1;
INSERT OR IGNORE INTO platform_lifecycle_states(lifecycle_definition_id,state_code,label,stage,terminal,custody_active,sequence_no)
SELECT id,'PICKED_UP','Picked Up','CUSTODY_ACTIVE',0,1,30 FROM platform_lifecycle_definitions WHERE lifecycle_key='logistics.default' AND version=1;
INSERT OR IGNORE INTO platform_lifecycle_states(lifecycle_definition_id,state_code,label,stage,terminal,custody_active,sequence_no)
SELECT id,'IN_TRANSIT','In Transit','CUSTODY_ACTIVE',0,1,40 FROM platform_lifecycle_definitions WHERE lifecycle_key='logistics.default' AND version=1;
INSERT OR IGNORE INTO platform_lifecycle_states(lifecycle_definition_id,state_code,label,stage,terminal,custody_active,sequence_no)
SELECT id,'DELIVERED','Delivered','POST_DELIVERY',0,0,50 FROM platform_lifecycle_definitions WHERE lifecycle_key='logistics.default' AND version=1;
INSERT OR IGNORE INTO platform_lifecycle_states(lifecycle_definition_id,state_code,label,stage,terminal,custody_active,sequence_no)
SELECT id,'COMPLETED','Completed','TERMINAL',1,0,60 FROM platform_lifecycle_definitions WHERE lifecycle_key='logistics.default' AND version=1;
INSERT OR IGNORE INTO platform_lifecycle_states(lifecycle_definition_id,state_code,label,stage,terminal,custody_active,sequence_no)
SELECT id,'CANCELLED','Cancelled','TERMINAL',1,0,70 FROM platform_lifecycle_definitions WHERE lifecycle_key='logistics.default' AND version=1;

INSERT OR IGNORE INTO platform_lifecycle_states(lifecycle_definition_id,state_code,label,stage,terminal,custody_active,sequence_no)
SELECT id,'CREATED','Created','PRE_EXECUTION',0,0,10 FROM platform_lifecycle_definitions WHERE lifecycle_key='general.default' AND version=1;
INSERT OR IGNORE INTO platform_lifecycle_states(lifecycle_definition_id,state_code,label,stage,terminal,custody_active,sequence_no)
SELECT id,'IN_PROGRESS','In Progress','EXECUTION',0,0,20 FROM platform_lifecycle_definitions WHERE lifecycle_key='general.default' AND version=1;
INSERT OR IGNORE INTO platform_lifecycle_states(lifecycle_definition_id,state_code,label,stage,terminal,custody_active,sequence_no)
SELECT id,'COMPLETED','Completed','TERMINAL',1,0,30 FROM platform_lifecycle_definitions WHERE lifecycle_key='general.default' AND version=1;
INSERT OR IGNORE INTO platform_lifecycle_states(lifecycle_definition_id,state_code,label,stage,terminal,custody_active,sequence_no)
SELECT id,'CANCELLED','Cancelled','TERMINAL',1,0,40 FROM platform_lifecycle_definitions WHERE lifecycle_key='general.default' AND version=1;

INSERT OR IGNORE INTO platform_lifecycle_transitions(lifecycle_definition_id,from_state_code,to_state_code,transition_code,action_code,reason_code,required_role_codes_json)
SELECT id,'PENDING','ARRIVED','ARRIVE','confirm_arrival','executor_confirms_arrival','["admin","driver","executor"]' FROM platform_lifecycle_definitions WHERE lifecycle_key='logistics.default' AND version=1;
INSERT OR IGNORE INTO platform_lifecycle_transitions(lifecycle_definition_id,from_state_code,to_state_code,transition_code,action_code,reason_code,required_role_codes_json)
SELECT id,'ARRIVED','PICKED_UP','PICKUP','confirm_pickup','executor_confirms_pickup','["admin","driver","executor"]' FROM platform_lifecycle_definitions WHERE lifecycle_key='logistics.default' AND version=1;
INSERT OR IGNORE INTO platform_lifecycle_transitions(lifecycle_definition_id,from_state_code,to_state_code,transition_code,action_code,reason_code,required_role_codes_json)
SELECT id,'PICKED_UP','IN_TRANSIT','TRANSIT_START','start_transit','custodian_starts_transit','["admin","driver","executor"]' FROM platform_lifecycle_definitions WHERE lifecycle_key='logistics.default' AND version=1;
INSERT OR IGNORE INTO platform_lifecycle_transitions(lifecycle_definition_id,from_state_code,to_state_code,transition_code,action_code,reason_code,required_role_codes_json)
SELECT id,'IN_TRANSIT','DELIVERED','DELIVER','confirm_delivery','executor_confirms_delivery','["admin","driver","executor"]' FROM platform_lifecycle_definitions WHERE lifecycle_key='logistics.default' AND version=1;
INSERT OR IGNORE INTO platform_lifecycle_transitions(lifecycle_definition_id,from_state_code,to_state_code,transition_code,action_code,reason_code,required_role_codes_json)
SELECT id,'DELIVERED','COMPLETED','COMPLETE','complete_mission','authorized_completion_after_gate','["admin"]' FROM platform_lifecycle_definitions WHERE lifecycle_key='logistics.default' AND version=1;
INSERT OR IGNORE INTO platform_lifecycle_transitions(lifecycle_definition_id,from_state_code,to_state_code,transition_code,action_code,reason_code,required_role_codes_json)
SELECT id,'PENDING','CANCELLED','CANCEL','cancel_mission','owner_cancels_pre_custody','["admin"]' FROM platform_lifecycle_definitions WHERE lifecycle_key='logistics.default' AND version=1;
INSERT OR IGNORE INTO platform_lifecycle_transitions(lifecycle_definition_id,from_state_code,to_state_code,transition_code,action_code,reason_code,required_role_codes_json)
SELECT id,'CREATED','IN_PROGRESS','START','start_work','work_started','["admin","operator"]' FROM platform_lifecycle_definitions WHERE lifecycle_key='general.default' AND version=1;
INSERT OR IGNORE INTO platform_lifecycle_transitions(lifecycle_definition_id,from_state_code,to_state_code,transition_code,action_code,reason_code,required_role_codes_json)
SELECT id,'IN_PROGRESS','COMPLETED','COMPLETE','complete_work','work_completed','["admin","operator"]' FROM platform_lifecycle_definitions WHERE lifecycle_key='general.default' AND version=1;
INSERT OR IGNORE INTO platform_lifecycle_transitions(lifecycle_definition_id,from_state_code,to_state_code,transition_code,action_code,reason_code,required_role_codes_json)
SELECT id,'CREATED','CANCELLED','CANCEL','cancel_work','owner_cancelled','["admin"]' FROM platform_lifecycle_definitions WHERE lifecycle_key='general.default' AND version=1;

-- Real-world logistics normalization.
CREATE TABLE IF NOT EXISTS mission_stops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  sequence_no INTEGER NOT NULL,
  stop_type TEXT NOT NULL CHECK(stop_type IN ('pickup','intermediate','delivery','other')),
  status TEXT NOT NULL DEFAULT 'pending',
  company_name TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  postal_code TEXT,
  city TEXT,
  region TEXT,
  latitude REAL,
  longitude REAL,
  access_from TEXT,
  access_to TEXT,
  planned_arrival_at TEXT,
  planned_departure_at TEXT,
  estimated_arrival_at TEXT,
  actual_arrival_at TEXT,
  actual_departure_at TEXT,
  instructions TEXT,
  evidence_required INTEGER NOT NULL DEFAULT 0 CHECK(evidence_required IN (0,1)),
  state_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(mission_id,sequence_no),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mission_objects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  sequence_no INTEGER NOT NULL DEFAULT 1,
  object_type TEXT NOT NULL,
  description TEXT,
  weight_kg REAL,
  volume_m3 REAL,
  pallet_count INTEGER,
  identifiers_json TEXT NOT NULL DEFAULT '[]',
  requirements_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(mission_id,sequence_no),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mission_assignment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id INTEGER NOT NULL,
  company_id INTEGER NOT NULL,
  assignment_type TEXT NOT NULL,
  actor_type TEXT,
  actor_id INTEGER,
  driver_id INTEGER,
  executor_id INTEGER,
  event_code TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mission_custody_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id INTEGER NOT NULL,
  company_id INTEGER NOT NULL,
  event_code TEXT NOT NULL,
  holder_type TEXT,
  holder_id INTEGER,
  target_type TEXT,
  target_id INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mission_evidence_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id INTEGER NOT NULL,
  company_id INTEGER NOT NULL,
  file_id INTEGER,
  evidence_type TEXT NOT NULL,
  event_code TEXT NOT NULL,
  actor_type TEXT,
  actor_id INTEGER,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(file_id) REFERENCES mission_files(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_mission_stops_mission ON mission_stops(mission_id,sequence_no);
CREATE INDEX IF NOT EXISTS idx_mission_objects_mission ON mission_objects(mission_id,sequence_no);
CREATE INDEX IF NOT EXISTS idx_mission_assignment_events_mission ON mission_assignment_events(mission_id,created_at,id);
CREATE INDEX IF NOT EXISTS idx_mission_custody_events_mission ON mission_custody_events(mission_id,created_at,id);
CREATE INDEX IF NOT EXISTS idx_mission_evidence_events_mission ON mission_evidence_events(mission_id,created_at,id);

-- Lifecycle/product snapshot on operational records: the mission follows the contract it was created under.
ALTER TABLE missions ADD COLUMN country_code TEXT;
ALTER TABLE missions ADD COLUMN sector_code TEXT;
ALTER TABLE missions ADD COLUMN product_definition_id INTEGER REFERENCES platform_product_definitions(id) ON DELETE SET NULL;
ALTER TABLE missions ADD COLUMN lifecycle_definition_id INTEGER REFERENCES platform_lifecycle_definitions(id) ON DELETE SET NULL;
ALTER TABLE missions ADD COLUMN lifecycle_state_code TEXT;
ALTER TABLE missions ADD COLUMN archived_at TEXT;
ALTER TABLE missions ADD COLUMN archived_by_identity_id INTEGER;
ALTER TABLE missions ADD COLUMN archive_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_missions_lifecycle ON missions(lifecycle_definition_id,lifecycle_state_code,status);
CREATE INDEX IF NOT EXISTS idx_missions_sector ON missions(country_code,sector_code,product_definition_id);

-- Seed existing missions with the generic logistics contract when their current tenant sector is logistics;
-- otherwise use the generic lifecycle. This is a compatibility bridge, not a second authority.
UPDATE missions
SET sector_code=COALESCE((SELECT sector_code FROM company_management_profiles cmp WHERE cmp.company_id=missions.company_id),'general'),
    country_code=COALESCE((SELECT country_code FROM company_management_profiles cmp WHERE cmp.company_id=missions.company_id),'ZZ')
WHERE sector_code IS NULL OR country_code IS NULL;
UPDATE missions
SET lifecycle_definition_id=(SELECT id FROM platform_lifecycle_definitions WHERE lifecycle_key=CASE WHEN sector_code='logistics' THEN 'logistics.default' ELSE 'general.default' END AND version=1 LIMIT 1),
    lifecycle_state_code=CASE WHEN sector_code='logistics' THEN REPLACE(UPPER(status),'PICKEDUP','PICKED_UP') ELSE CASE UPPER(status) WHEN 'PENDING' THEN 'CREATED' WHEN 'COMPLETED' THEN 'COMPLETED' WHEN 'CANCELLED' THEN 'CANCELLED' ELSE 'IN_PROGRESS' END END
WHERE lifecycle_definition_id IS NULL;

-- Backfill one pickup and one delivery stop plus one object from the existing one-object/one-pickup/one-delivery mission shape.
INSERT OR IGNORE INTO mission_stops(company_id,mission_id,sequence_no,stop_type,status,company_name,address_line1,postal_code,city,latitude,longitude,access_from,access_to,planned_arrival_at,planned_departure_at,evidence_required)
SELECT company_id,id,1,'pickup',CASE WHEN status IN ('PickedUp','InTransit','Delivered','Completed') THEN 'completed' ELSE 'pending' END,pickup_company,COALESCE(pickup_street,pickup_address),pickup_zip_code,pickup_city,pickup_latitude,pickup_longitude,pickup_access_from,pickup_access_to,pickup_at_utc,pickup_at_utc,0 FROM missions;
INSERT OR IGNORE INTO mission_stops(company_id,mission_id,sequence_no,stop_type,status,company_name,address_line1,postal_code,city,latitude,longitude,access_from,access_to,planned_arrival_at,planned_departure_at,evidence_required)
SELECT company_id,id,2,'delivery',CASE WHEN status IN ('Delivered','Completed') THEN 'completed' ELSE 'pending' END,delivery_company,COALESCE(delivery_street,delivery_address),delivery_zip_code,delivery_city,delivery_latitude,delivery_longitude,delivery_access_from,delivery_access_to,delivery_at_utc,delivery_at_utc,delivery_proof_required FROM missions;
INSERT OR IGNORE INTO mission_objects(company_id,mission_id,sequence_no,object_type,description,weight_kg,volume_m3,pallet_count)
SELECT company_id,id,1,COALESCE(object_type,'general'),object_description,weight_kg,volume_m3,pallet_count FROM missions;

-- Existing active product launches receive the generic lifecycle binding for every declared sector only as a compatibility bridge.
-- New launches must explicitly configure and validate their sector lifecycle through the Product Contract.
INSERT OR IGNORE INTO platform_product_sector_lifecycles(launch_id,product_definition_id,sector_code,lifecycle_definition_id,status,active,effective_at,created_by_type,created_by_id)
SELECT l.id,NULL,s.value,ld.id,'active',1,l.effective_at,'system','10.41.0'
FROM country_product_launches l
JOIN platform_lifecycle_definitions ld ON ld.lifecycle_key=CASE WHEN lower(s.value)='logistics' THEN 'logistics.default' ELSE 'general.default' END AND ld.version=1
JOIN json_each(json_extract(l.eligibility_json,'$.sectors')) s
WHERE l.active=1;
