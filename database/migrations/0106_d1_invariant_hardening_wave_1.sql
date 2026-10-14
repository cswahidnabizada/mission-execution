-- ON Mission 10.44.0 — D1 Invariant Hardening — Wave 1
-- Move high-confidence canonical invariants from application assumptions into D1.
-- This wave intentionally targets tenant/parent integrity, canonical logistics,
-- assignment integrity, lifecycle binding/transition integrity, and evidence/custody.

-- ---------------------------------------------------------------------------
-- Canonical mission tenant identity
-- ---------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_missions_driver_company_guard_insert
BEFORE INSERT ON missions
WHEN NEW.driver_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1 FROM drivers d
   WHERE d.id=NEW.driver_id AND d.company_id=NEW.company_id
 )
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission driver company mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_missions_driver_company_guard_update
BEFORE UPDATE OF company_id,driver_id ON missions
WHEN NEW.driver_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1 FROM drivers d
   WHERE d.id=NEW.driver_id AND d.company_id=NEW.company_id
 )
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission driver company mismatch');
END;

-- ---------------------------------------------------------------------------
-- Canonical logistics tenant/parent integrity
-- ---------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_mission_stops_company_guard_insert
BEFORE INSERT ON mission_stops
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission stop company/mission mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_stops_company_guard_update
BEFORE UPDATE OF company_id,mission_id ON mission_stops
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission stop company/mission mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_objects_company_guard_insert
BEFORE INSERT ON mission_objects
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission object company/mission mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_objects_company_guard_update
BEFORE UPDATE OF company_id,mission_id ON mission_objects
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission object company/mission mismatch');
END;

-- ---------------------------------------------------------------------------
-- Canonical assignment integrity
-- ---------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_mission_assignments_integrity_insert
BEFORE INSERT ON mission_assignments
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
 OR (NEW.assignee_type='driver' AND NOT EXISTS (
   SELECT 1 FROM drivers d
   WHERE d.id=NEW.assignee_id
     AND (NEW.assignee_company_id IS NULL OR d.company_id=NEW.assignee_company_id)
 ))
 OR (NEW.assignee_type='executor' AND NOT EXISTS (
   SELECT 1 FROM public_executor_identities e
   WHERE e.id=NEW.assignee_id AND e.deleted_at IS NULL
 ))
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission assignment integrity failure');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_assignments_integrity_update
BEFORE UPDATE OF company_id,mission_id,assignee_type,assignee_id,assignee_company_id ON mission_assignments
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
 OR (NEW.assignee_type='driver' AND NOT EXISTS (
   SELECT 1 FROM drivers d
   WHERE d.id=NEW.assignee_id
     AND (NEW.assignee_company_id IS NULL OR d.company_id=NEW.assignee_company_id)
 ))
 OR (NEW.assignee_type='executor' AND NOT EXISTS (
   SELECT 1 FROM public_executor_identities e
   WHERE e.id=NEW.assignee_id AND e.deleted_at IS NULL
 ))
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission assignment integrity failure');
END;

-- ---------------------------------------------------------------------------
-- Lifecycle binding and legal transition integrity
-- ---------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_missions_lifecycle_binding_insert
BEFORE INSERT ON missions
WHEN NEW.lifecycle_definition_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1 FROM platform_lifecycle_definitions d
   WHERE d.id=NEW.lifecycle_definition_id
 )
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: unknown lifecycle definition');
END;

CREATE TRIGGER IF NOT EXISTS trg_missions_lifecycle_binding_update
BEFORE UPDATE OF lifecycle_definition_id,lifecycle_state_code ON missions
WHEN (NEW.lifecycle_definition_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM platform_lifecycle_definitions d
   WHERE d.id=NEW.lifecycle_definition_id
 ))
 OR (NEW.lifecycle_definition_id IS NOT NULL AND NEW.lifecycle_state_code IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM platform_lifecycle_states s
   WHERE s.lifecycle_definition_id=NEW.lifecycle_definition_id
     AND s.state_code=NEW.lifecycle_state_code
 ))
 OR (OLD.lifecycle_definition_id IS NOT NULL AND NEW.lifecycle_definition_id IS NOT OLD.lifecycle_definition_id)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: invalid or changed lifecycle binding');
END;

CREATE TRIGGER IF NOT EXISTS trg_missions_lifecycle_state_insert
BEFORE INSERT ON missions
WHEN NEW.lifecycle_definition_id IS NOT NULL
 AND NEW.lifecycle_state_code IS NOT NULL
 AND NOT EXISTS (
   SELECT 1 FROM platform_lifecycle_states s
   WHERE s.lifecycle_definition_id=NEW.lifecycle_definition_id
     AND s.state_code=NEW.lifecycle_state_code
 )
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: unknown lifecycle state');
END;

CREATE TRIGGER IF NOT EXISTS trg_missions_lifecycle_transition_update
BEFORE UPDATE OF lifecycle_state_code ON missions
WHEN OLD.lifecycle_state_code IS NOT NULL
 AND NEW.lifecycle_state_code IS NOT OLD.lifecycle_state_code
 AND NEW.lifecycle_definition_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1 FROM platform_lifecycle_transitions t
   WHERE t.lifecycle_definition_id=NEW.lifecycle_definition_id
     AND t.from_state_code=OLD.lifecycle_state_code
     AND t.to_state_code=NEW.lifecycle_state_code
 )
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: illegal lifecycle transition');
END;

-- ---------------------------------------------------------------------------
-- Canonical custody/evidence/event tenant integrity
-- ---------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_mission_custody_events_company_guard_insert
BEFORE INSERT ON mission_custody_events
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: custody event company/mission mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_custody_events_company_guard_update
BEFORE UPDATE OF company_id,mission_id ON mission_custody_events
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: custody event company/mission mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_evidence_events_company_guard_insert
BEFORE INSERT ON mission_evidence_events
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
 OR (NEW.file_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM mission_files f
   WHERE f.id=NEW.file_id
     AND f.mission_id=NEW.mission_id
     AND f.company_id=NEW.company_id
 ))
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: evidence event scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_evidence_events_company_guard_update
BEFORE UPDATE OF company_id,mission_id,file_id ON mission_evidence_events
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
 OR (NEW.file_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM mission_files f
   WHERE f.id=NEW.file_id
     AND f.mission_id=NEW.mission_id
     AND f.company_id=NEW.company_id
 ))
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: evidence event scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_event_ledger_company_guard_insert
BEFORE INSERT ON mission_event_ledger
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: event ledger company/mission mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_event_ledger_company_guard_update
BEFORE UPDATE OF company_id,mission_id ON mission_event_ledger
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: event ledger company/mission mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_transition_requests_company_guard_insert
BEFORE INSERT ON mission_transition_requests
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: transition request company/mission mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_transition_requests_company_guard_update
BEFORE UPDATE OF company_id,mission_id ON mission_transition_requests
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: transition request company/mission mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_transition_events_company_guard_insert
BEFORE INSERT ON mission_transition_events
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: transition event company/mission mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_transition_events_company_guard_update
BEFORE UPDATE OF company_id,mission_id ON mission_transition_events
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: transition event company/mission mismatch');
END;

-- ---------------------------------------------------------------------------
-- Supporting lookup indexes for invariant enforcement and tenant-safe access.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mission_stops_company_mission
  ON mission_stops(company_id,mission_id,sequence_no);
CREATE INDEX IF NOT EXISTS idx_mission_objects_company_mission
  ON mission_objects(company_id,mission_id,sequence_no);
CREATE INDEX IF NOT EXISTS idx_mission_assignments_company_mission_status
  ON mission_assignments(company_id,mission_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_mission_custody_events_company_mission
  ON mission_custody_events(company_id,mission_id,created_at,id);
CREATE INDEX IF NOT EXISTS idx_mission_evidence_events_company_mission
  ON mission_evidence_events(company_id,mission_id,created_at,id);
CREATE INDEX IF NOT EXISTS idx_mission_event_ledger_company_mission
  ON mission_event_ledger(company_id,mission_id,created_at,id);
CREATE INDEX IF NOT EXISTS idx_mission_transition_requests_company_mission
  ON mission_transition_requests(company_id,mission_id,status,updated_at);
CREATE INDEX IF NOT EXISTS idx_mission_transition_events_company_mission
  ON mission_transition_events(company_id,mission_id,created_at,id);
