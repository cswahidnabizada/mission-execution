-- ON Mission 10.85.2 — Canonical Assignment Scope Hardening
-- Tighten the D1 boundary for canonical mission assignments.
-- Application normalization already supplies assignee_company_id; these guards make
-- the database authoritative for owner-driver tenant scope and shared-driver access.
-- No new authority is introduced and no legacy assignment table is reactivated.

CREATE TRIGGER IF NOT EXISTS trg_mission_assignments_scope_hardening_insert
BEFORE INSERT ON mission_assignments
WHEN
  (NEW.assignee_type='driver' AND NEW.assignment_type='owner_driver' AND (
    NEW.assignee_company_id IS NULL
    OR NEW.assignee_company_id<>NEW.company_id
    OR NOT EXISTS (
      SELECT 1 FROM drivers d
      WHERE d.id=NEW.assignee_id AND d.company_id=NEW.company_id
    )
  ))
  OR
  (NEW.assignee_type='driver' AND NEW.assignment_type='tenant_driver' AND (
    NEW.assignee_company_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM drivers d
      WHERE d.id=NEW.assignee_id AND d.company_id=NEW.assignee_company_id
    )
    OR NOT EXISTS (
      SELECT 1 FROM mission_tenant_access a
      WHERE a.mission_id=NEW.mission_id
        AND a.owner_company_id=NEW.company_id
        AND a.access_company_id=NEW.assignee_company_id
        AND a.status='active'
    )
  ))
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: canonical assignment scope mismatch');
END;

CREATE TRIGGER IF NOT EXISTS trg_mission_assignments_scope_hardening_update
BEFORE UPDATE OF company_id,mission_id,assignment_type,assignee_type,assignee_id,assignee_company_id ON mission_assignments
WHEN
  (NEW.assignee_type='driver' AND NEW.assignment_type='owner_driver' AND (
    NEW.assignee_company_id IS NULL
    OR NEW.assignee_company_id<>NEW.company_id
    OR NOT EXISTS (
      SELECT 1 FROM drivers d
      WHERE d.id=NEW.assignee_id AND d.company_id=NEW.company_id
    )
  ))
  OR
  (NEW.assignee_type='driver' AND NEW.assignment_type='tenant_driver' AND (
    NEW.assignee_company_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM drivers d
      WHERE d.id=NEW.assignee_id AND d.company_id=NEW.assignee_company_id
    )
    OR NOT EXISTS (
      SELECT 1 FROM mission_tenant_access a
      WHERE a.mission_id=NEW.mission_id
        AND a.owner_company_id=NEW.company_id
        AND a.access_company_id=NEW.assignee_company_id
        AND a.status='active'
    )
  ))
BEGIN
  SELECT RAISE(ABORT,'INVARIANT_VIOLATION: canonical assignment scope mismatch');
END;
