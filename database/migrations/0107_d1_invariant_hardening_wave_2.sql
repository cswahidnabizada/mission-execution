-- ON Mission 10.44.1 — D1 Invariant Hardening — Wave 2
-- Harden cross-entity integrity for files, messages, requests, recipient/access
-- projections, custody records and historical mission evidence. No new authority.

-- ---------------------------------------------------------------------------
-- Mission files: tenant/parent identity and referenced driver/controller
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Mission messages: tenant/parent and file/driver references
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Delivery proof: mission/file scope and submitting identity
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Mission cancellation/custody/exception/management records
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Lifecycle history and status history must reference a real mission in scope
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Recipient/access projections: preserve owner/access tenant boundaries
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Targeted lookup indexes for the new guards
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mission_files_company_mission ON mission_files(company_id,mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_messages_company_mission ON mission_messages(company_id,mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_delivery_proofs_company_mission ON mission_delivery_proofs(company_id,mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_cancellations_company_mission ON mission_cancellations(company_id,mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_custody_cases_company_mission ON mission_custody_cases(company_id,mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_exceptions_company_mission ON mission_exceptions(company_id,mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_management_requirements_company_mission ON mission_management_requirements(company_id,mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_lifecycle_events_company_mission ON mission_lifecycle_events(company_id,mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_recipient_state_owner_mission ON mission_recipient_state(mission_owner_company_id,mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_tenant_access_owner_mission ON mission_tenant_access(owner_company_id,mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_tenant_driver_assignment_owner_mission ON mission_tenant_driver_assignments(owner_company_id,mission_id);
