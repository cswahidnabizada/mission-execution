-- V8.9.53 — production query/index hardening.
-- Read/write behavior is unchanged. These indexes support the hot tenant-scoped
-- mission, history, assignment, collaboration and custody queries used by the
-- operational workbench and analytics services.

CREATE INDEX IF NOT EXISTS idx_missions_company_status_updated
  ON missions(company_id,status,updated_at DESC,id DESC);

CREATE INDEX IF NOT EXISTS idx_missions_company_date
  ON missions(company_id,mission_date DESC,id DESC);

CREATE INDEX IF NOT EXISTS idx_mission_status_history_mission_status_time
  ON mission_status_history(mission_id,status,created_at DESC,id DESC);

CREATE INDEX IF NOT EXISTS idx_public_requests_company_mission_status_updated
  ON public_mission_requests(company_id,mission_id,status,updated_at DESC,id DESC);

CREATE INDEX IF NOT EXISTS idx_executor_assignments_company_mission_status
  ON mission_executor_assignments(company_id,mission_id,status,id DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_access_owner_mission_status
  ON mission_tenant_access(owner_company_id,mission_id,status,updated_at DESC,id DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_driver_assignment_mission_owner_access
  ON mission_tenant_driver_assignments(mission_id,owner_company_id,access_company_id,driver_id);
