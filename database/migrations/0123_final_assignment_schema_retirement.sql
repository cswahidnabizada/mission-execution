-- 0123 — Final Assignment Schema Retirement
-- The canonical assignment authority and projection have been production-tested.
-- missions.driver_id is no longer a source of truth and has no live consumers.
-- This migration retires the legacy assignment column from runtime authority while
-- retaining the FK-bound compatibility column physically. SQLite/D1 cannot safely
-- DROP this column in place because missions.driver_id owns a foreign key to drivers
-- and missions is itself referenced by many tenant-scoped tables. A destructive
-- table rebuild would require rebuilding the entire FK graph. Therefore this migration
-- removes the obsolete assignment indexes/triggers and all runtime consumers, while
-- preserving the compatibility column and its FK for data/schema safety.
-- Legacy assignment tables remain intentionally frozen historical migration
-- artifacts because their historical evidence is retained by the canonical
-- assignment reconciliation/event model and historical migrations.

DROP VIEW IF EXISTS mission_canonical_projection;
DROP TRIGGER IF EXISTS trg_missions_driver_company_guard_insert;
DROP TRIGGER IF EXISTS trg_missions_driver_company_guard_update;
DROP TRIGGER IF EXISTS trg_mission_stops_company_guard_insert;
DROP TRIGGER IF EXISTS trg_mission_stops_company_guard_update;
DROP TRIGGER IF EXISTS trg_mission_objects_company_guard_insert;
DROP TRIGGER IF EXISTS trg_mission_objects_company_guard_update;
DROP TRIGGER IF EXISTS trg_mission_assignments_integrity_insert;
DROP TRIGGER IF EXISTS trg_mission_assignments_integrity_update;
DROP TRIGGER IF EXISTS trg_missions_lifecycle_binding_insert;
DROP TRIGGER IF EXISTS trg_missions_lifecycle_binding_update;
DROP TRIGGER IF EXISTS trg_missions_lifecycle_state_insert;
DROP TRIGGER IF EXISTS trg_missions_lifecycle_transition_update;
DROP TRIGGER IF EXISTS trg_mission_custody_events_company_guard_insert;
DROP TRIGGER IF EXISTS trg_mission_custody_events_company_guard_update;
DROP TRIGGER IF EXISTS trg_mission_evidence_events_company_guard_insert;
DROP TRIGGER IF EXISTS trg_mission_evidence_events_company_guard_update;
DROP TRIGGER IF EXISTS trg_mission_event_ledger_company_guard_insert;
DROP TRIGGER IF EXISTS trg_mission_event_ledger_company_guard_update;
DROP TRIGGER IF EXISTS trg_mission_transition_requests_company_guard_insert;
DROP TRIGGER IF EXISTS trg_mission_transition_requests_company_guard_update;
DROP TRIGGER IF EXISTS trg_mission_transition_events_company_guard_insert;
DROP TRIGGER IF EXISTS trg_mission_transition_events_company_guard_update;
DROP TRIGGER IF EXISTS trg_mission_files_scope_guard_insert;
DROP TRIGGER IF EXISTS trg_mission_files_scope_guard_update;
DROP TRIGGER IF EXISTS trg_mission_messages_scope_guard_insert;
DROP TRIGGER IF EXISTS trg_mission_messages_scope_guard_update;
DROP TRIGGER IF EXISTS trg_mission_delivery_proofs_scope_guard_insert;
DROP TRIGGER IF EXISTS trg_mission_delivery_proofs_scope_guard_update;
DROP TRIGGER IF EXISTS trg_mission_cancellations_scope_guard_insert;
DROP TRIGGER IF EXISTS trg_mission_cancellations_scope_guard_update;
DROP TRIGGER IF EXISTS trg_mission_custody_cases_scope_guard_insert;
DROP TRIGGER IF EXISTS trg_mission_custody_cases_scope_guard_update;
DROP TRIGGER IF EXISTS trg_mission_exceptions_scope_guard_insert;
DROP TRIGGER IF EXISTS trg_mission_exceptions_scope_guard_update;
DROP TRIGGER IF EXISTS trg_mission_management_requirements_scope_guard_insert;
DROP TRIGGER IF EXISTS trg_mission_management_requirements_scope_guard_update;
DROP TRIGGER IF EXISTS trg_mission_lifecycle_events_scope_guard_insert;
DROP TRIGGER IF EXISTS trg_mission_lifecycle_events_scope_guard_update;
DROP TRIGGER IF EXISTS trg_mission_status_history_mission_guard_insert;
DROP TRIGGER IF EXISTS trg_mission_status_history_mission_guard_update;
DROP TRIGGER IF EXISTS trg_mission_recipient_state_scope_guard_insert;
DROP TRIGGER IF EXISTS trg_mission_recipient_state_scope_guard_update;
DROP TRIGGER IF EXISTS trg_mission_tenant_access_scope_guard_insert;
DROP TRIGGER IF EXISTS trg_mission_tenant_access_scope_guard_update;
DROP TRIGGER IF EXISTS trg_mission_tenant_driver_assignment_scope_guard_insert;
DROP TRIGGER IF EXISTS trg_mission_tenant_driver_assignment_scope_guard_update;

DROP INDEX IF EXISTS idx_missions_company_driver_next_schedule;
DROP INDEX IF EXISTS idx_missions_company_driver_schedule;

CREATE VIEW mission_canonical_projection AS
SELECT
  m.id,m.company_id,m.reference,
  ps.company_name AS pickup_company,
  ps.address_line1 AS pickup_address,
  ds.company_name AS delivery_company,
  ds.address_line1 AS delivery_address,
  m.mission_date,m.status,m.public_enabled,m.public_description,m.created_at,m.updated_at,
  m.mission_end_time,m.pickup_time,m.delivery_time,m.deadline_at,m.pickup_at_utc,m.delivery_at_utc,m.deadline_at_utc,m.schedule_timezone,
  m.status_changed_at,m.delivery_proof_required,m.customer_id,
  ps.access_from AS pickup_access_from,
  ps.access_to AS pickup_access_to,
  ds.access_from AS delivery_access_from,
  ds.access_to AS delivery_access_to,
  m.state_version,m.state_lock_token,m.state_lock_at,
  ps.address_line1 AS pickup_street,
  ps.postal_code AS pickup_zip_code,
  ps.city AS pickup_city,
  ds.address_line1 AS delivery_street,
  ds.postal_code AS delivery_zip_code,
  ds.city AS delivery_city,
  ps.latitude AS pickup_latitude,
  ps.longitude AS pickup_longitude,
  ds.latitude AS delivery_latitude,
  ds.longitude AS delivery_longitude,
  o.object_type AS object_type,
  o.description AS object_description,
  o.weight_kg AS weight_kg,
  o.volume_m3 AS volume_m3,
  o.pallet_count AS pallet_count,
  json_extract(o.requirements_json,'$.vehicle') AS vehicle_requirement,
  json_extract(o.requirements_json,'$.loading') AS loading_type,
  json_extract(o.requirements_json,'$.unloading') AS unloading_type,
  json_extract(o.requirements_json,'$.matchingNotes') AS matching_notes,
  m.capability_code,m.objective,m.responsibility_mode,m.country_code,m.sector_code,m.product_definition_id,m.lifecycle_definition_id,m.lifecycle_state_code,
  m.archived_at,m.archived_by_identity_id,m.archive_reason
FROM missions m
LEFT JOIN mission_stops ps
  ON ps.company_id=m.company_id AND ps.mission_id=m.id AND ps.stop_type='pickup'
  AND ps.id=(SELECT x.id FROM mission_stops x WHERE x.company_id=m.company_id AND x.mission_id=m.id AND x.stop_type='pickup' ORDER BY x.sequence_no LIMIT 1)
LEFT JOIN mission_stops ds
  ON ds.company_id=m.company_id AND ds.mission_id=m.id AND ds.stop_type='delivery'
  AND ds.id=(SELECT x.id FROM mission_stops x WHERE x.company_id=m.company_id AND x.mission_id=m.id AND x.stop_type='delivery' ORDER BY x.sequence_no DESC LIMIT 1)
LEFT JOIN mission_objects o
  ON o.company_id=m.company_id AND o.mission_id=m.id
  AND o.id=(SELECT x.id FROM mission_objects x WHERE x.company_id=m.company_id AND x.mission_id=m.id ORDER BY x.sequence_no LIMIT 1);

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

CREATE TRIGGER IF NOT EXISTS trg_mission_files_scope_guard_insert
BEFORE INSERT ON mission_files
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
 OR (NEW.driver_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM drivers d
  WHERE d.id=NEW.driver_id AND d.company_id=NEW.company_id
 ))
 OR (NEW.controller_company_id IS NOT NULL AND NEW.controller_company_id<>NEW.company_id)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission file scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_files_scope_guard_update
BEFORE UPDATE OF company_id,mission_id,driver_id,controller_company_id ON mission_files
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
 OR (NEW.driver_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM drivers d
  WHERE d.id=NEW.driver_id AND d.company_id=NEW.company_id
 ))
 OR (NEW.controller_company_id IS NOT NULL AND NEW.controller_company_id<>NEW.company_id)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission file scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_messages_scope_guard_insert
BEFORE INSERT ON mission_messages
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
 OR (NEW.driver_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM drivers d
  WHERE d.id=NEW.driver_id AND d.company_id=NEW.company_id
 ))
 OR (NEW.file_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM mission_files f
  WHERE f.id=NEW.file_id AND f.mission_id=NEW.mission_id AND f.company_id=NEW.company_id
 ))
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission message scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_messages_scope_guard_update
BEFORE UPDATE OF company_id,mission_id,driver_id,file_id ON mission_messages
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
 OR (NEW.driver_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM drivers d
  WHERE d.id=NEW.driver_id AND d.company_id=NEW.company_id
 ))
 OR (NEW.file_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM mission_files f
  WHERE f.id=NEW.file_id AND f.mission_id=NEW.mission_id AND f.company_id=NEW.company_id
 ))
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission message scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_delivery_proofs_scope_guard_insert
BEFORE INSERT ON mission_delivery_proofs
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
 OR NOT EXISTS (
  SELECT 1 FROM mission_files f
  WHERE f.id=NEW.file_id AND f.mission_id=NEW.mission_id AND f.company_id=NEW.company_id
)
 OR (NEW.driver_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM drivers d
  WHERE d.id=NEW.driver_id AND d.company_id=NEW.company_id
 ))
 OR (NEW.executor_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public_executor_identities e
  WHERE e.id=NEW.executor_id AND e.deleted_at IS NULL
 ))
 OR (NEW.submitted_by_role='driver' AND NEW.driver_id IS NULL)
 OR (NEW.submitted_by_role='executor' AND NEW.executor_id IS NULL)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission delivery proof scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_delivery_proofs_scope_guard_update
BEFORE UPDATE OF company_id,mission_id,file_id,submitted_by_role,driver_id,executor_id ON mission_delivery_proofs
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
 OR NOT EXISTS (
  SELECT 1 FROM mission_files f
  WHERE f.id=NEW.file_id AND f.mission_id=NEW.mission_id AND f.company_id=NEW.company_id
)
 OR (NEW.driver_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM drivers d
  WHERE d.id=NEW.driver_id AND d.company_id=NEW.company_id
 ))
 OR (NEW.executor_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public_executor_identities e
  WHERE e.id=NEW.executor_id AND e.deleted_at IS NULL
 ))
 OR (NEW.submitted_by_role='driver' AND NEW.driver_id IS NULL)
 OR (NEW.submitted_by_role='executor' AND NEW.executor_id IS NULL)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission delivery proof scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_cancellations_scope_guard_insert
BEFORE INSERT ON mission_cancellations
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission cancellation scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_cancellations_scope_guard_update
BEFORE UPDATE OF company_id,mission_id ON mission_cancellations
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission cancellation scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_custody_cases_scope_guard_insert
BEFORE INSERT ON mission_custody_cases
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
 OR (NEW.current_holder_type='driver' AND NEW.current_holder_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM drivers d WHERE d.id=NEW.current_holder_id AND d.company_id=NEW.company_id
 ))
 OR (NEW.current_holder_type='executor' AND NEW.current_holder_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public_executor_identities e WHERE e.id=NEW.current_holder_id AND e.deleted_at IS NULL
 ))
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission custody case scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_custody_cases_scope_guard_update
BEFORE UPDATE OF company_id,mission_id,current_holder_type,current_holder_id ON mission_custody_cases
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
 OR (NEW.current_holder_type='driver' AND NEW.current_holder_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM drivers d WHERE d.id=NEW.current_holder_id AND d.company_id=NEW.company_id
 ))
 OR (NEW.current_holder_type='executor' AND NEW.current_holder_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public_executor_identities e WHERE e.id=NEW.current_holder_id AND e.deleted_at IS NULL
 ))
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission custody case scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_exceptions_scope_guard_insert
BEFORE INSERT ON mission_exceptions
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
 OR (NEW.driver_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM drivers d WHERE d.id=NEW.driver_id AND d.company_id=NEW.company_id
 ))
 OR (NEW.executor_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public_executor_identities e WHERE e.id=NEW.executor_id AND e.deleted_at IS NULL
 ))
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission exception scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_exceptions_scope_guard_update
BEFORE UPDATE OF company_id,mission_id,driver_id,executor_id ON mission_exceptions
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
 OR (NEW.driver_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM drivers d WHERE d.id=NEW.driver_id AND d.company_id=NEW.company_id
 ))
 OR (NEW.executor_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public_executor_identities e WHERE e.id=NEW.executor_id AND e.deleted_at IS NULL
 ))
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission exception scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_management_requirements_scope_guard_insert
BEFORE INSERT ON mission_management_requirements
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission management requirement scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_management_requirements_scope_guard_update
BEFORE UPDATE OF company_id,mission_id ON mission_management_requirements
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission management requirement scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_lifecycle_events_scope_guard_insert
BEFORE INSERT ON mission_lifecycle_events
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission lifecycle event scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_lifecycle_events_scope_guard_update
BEFORE UPDATE OF company_id,mission_id ON mission_lifecycle_events
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.company_id
)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission lifecycle event scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_status_history_mission_guard_insert
BEFORE INSERT ON mission_status_history
WHEN NOT EXISTS (SELECT 1 FROM missions m WHERE m.id=NEW.mission_id)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission status history references unknown mission');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_status_history_mission_guard_update
BEFORE UPDATE OF mission_id ON mission_status_history
WHEN NOT EXISTS (SELECT 1 FROM missions m WHERE m.id=NEW.mission_id)
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission status history references unknown mission');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_recipient_state_scope_guard_insert
BEFORE INSERT ON mission_recipient_state
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.mission_owner_company_id
)
 OR (NEW.recipient_driver_id IS NOT NULL AND NEW.recipient_tenant_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM drivers d WHERE d.id=NEW.recipient_driver_id AND d.company_id=NEW.recipient_tenant_id
 ))
 OR (NEW.recipient_executor_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public_executor_identities e WHERE e.id=NEW.recipient_executor_id AND e.deleted_at IS NULL
 ))
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission recipient state scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_recipient_state_scope_guard_update
BEFORE UPDATE OF mission_id,mission_owner_company_id,recipient_tenant_id,recipient_driver_id,recipient_executor_id ON mission_recipient_state
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.mission_owner_company_id
)
 OR (NEW.recipient_driver_id IS NOT NULL AND NEW.recipient_tenant_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM drivers d WHERE d.id=NEW.recipient_driver_id AND d.company_id=NEW.recipient_tenant_id
 ))
 OR (NEW.recipient_executor_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public_executor_identities e WHERE e.id=NEW.recipient_executor_id AND e.deleted_at IS NULL
 ))
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission recipient state scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_tenant_access_scope_guard_insert
BEFORE INSERT ON mission_tenant_access
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.owner_company_id
)
 OR (NEW.request_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public_mission_requests r
   WHERE r.id=NEW.request_id AND r.mission_id=NEW.mission_id AND r.company_id=NEW.owner_company_id
 ))
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission tenant access scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_tenant_access_scope_guard_update
BEFORE UPDATE OF mission_id,owner_company_id,request_id ON mission_tenant_access
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.owner_company_id
)
 OR (NEW.request_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public_mission_requests r
   WHERE r.id=NEW.request_id AND r.mission_id=NEW.mission_id AND r.company_id=NEW.owner_company_id
 ))
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission tenant access scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_tenant_driver_assignment_scope_guard_insert
BEFORE INSERT ON mission_tenant_driver_assignments
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.owner_company_id
)
 OR NOT EXISTS (
   SELECT 1 FROM companies c WHERE c.id=NEW.access_company_id
 )
 OR NOT EXISTS (
   SELECT 1 FROM drivers d WHERE d.id=NEW.driver_id AND d.company_id=NEW.access_company_id
 )
 OR NOT EXISTS (
   SELECT 1 FROM mission_tenant_access a
   WHERE a.mission_id=NEW.mission_id
     AND a.owner_company_id=NEW.owner_company_id
     AND a.access_company_id=NEW.access_company_id
     AND a.status='active'
 )
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission tenant driver assignment scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_tenant_driver_assignment_scope_guard_update
BEFORE UPDATE OF mission_id,owner_company_id,access_company_id,driver_id ON mission_tenant_driver_assignments
WHEN NOT EXISTS (
  SELECT 1 FROM missions m
  WHERE m.id=NEW.mission_id AND m.company_id=NEW.owner_company_id
)
 OR NOT EXISTS (
   SELECT 1 FROM companies c WHERE c.id=NEW.access_company_id
 )
 OR NOT EXISTS (
   SELECT 1 FROM drivers d WHERE d.id=NEW.driver_id AND d.company_id=NEW.access_company_id
 )
 OR NOT EXISTS (
   SELECT 1 FROM mission_tenant_access a
   WHERE a.mission_id=NEW.mission_id
     AND a.owner_company_id=NEW.owner_company_id
     AND a.access_company_id=NEW.access_company_id
     AND a.status='active'
 )
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: mission tenant driver assignment scope mismatch');
END;

