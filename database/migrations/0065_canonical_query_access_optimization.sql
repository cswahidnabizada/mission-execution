-- ON Mission 10.32.2 — Canonical Query & Data Access Optimization
-- Evidence-driven read-path indexes. Read-only optimization; no domain authority changes.

CREATE INDEX idx_mission_files_company_mission_id
  ON mission_files(company_id,mission_id,id);

CREATE INDEX idx_network_invitation_owner_mission_status_id
  ON network_mission_invitations(owner_company_id,mission_id,status,id DESC);

CREATE INDEX idx_public_requests_company_mission_status_type_updated
  ON public_mission_requests(company_id,mission_id,status,requester_type,COALESCE(updated_at,created_at) DESC,id DESC);

CREATE INDEX idx_missions_company_driver_next_schedule
  ON missions(company_id,driver_id,datetime(COALESCE(delivery_at_utc,updated_at)),id);
