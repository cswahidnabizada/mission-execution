-- ON Mission 10.42.2 — Canonical Assignment Read Projection
-- Read-only compatibility projection over the canonical mission_assignments authority.
-- Consumers must use this projection for assignment reads; legacy assignment tables
-- remain only as migration/compatibility storage until their consumers reach zero.
CREATE VIEW IF NOT EXISTS mission_active_assignment_projection AS
SELECT
  id,
  company_id,
  mission_id,
  assignment_type,
  assignee_type,
  assignee_id,
  assignee_company_id,
  request_id,
  status,
  assigned_at,
  updated_at,
  version,
  source_type,
  source_id,
  metadata_json
FROM mission_assignments
WHERE status='active';
