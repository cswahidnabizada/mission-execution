-- 10.18.11 — Runtime Performance & D1 Scale Foundation.
-- Additive read-path indexes only. No lifecycle, custody, authorization or truth behavior changes.
-- Supports the highest-frequency tenant/driver operational lookups without replacing existing indexes.

CREATE INDEX IF NOT EXISTS idx_missions_company_driver_schedule
  ON missions(company_id,driver_id,delivery_at_utc,updated_at,id);

CREATE INDEX IF NOT EXISTS idx_mission_exceptions_company_mission_status_time
  ON mission_exceptions(company_id,mission_id,status,created_at DESC,id DESC);

CREATE INDEX IF NOT EXISTS idx_transition_requests_company_mission_status
  ON mission_transition_requests(company_id,mission_id,status,updated_at DESC,id DESC);

CREATE INDEX IF NOT EXISTS idx_mission_event_ledger_company_mission_outcome_time
  ON mission_event_ledger(company_id,mission_id,outcome,created_at DESC,id DESC);
