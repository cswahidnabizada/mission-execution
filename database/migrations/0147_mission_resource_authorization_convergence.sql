-- ON Mission 13.9.0 — Mission Resource + Authorization Convergence
-- Operational mission plans/evaluations are first-class read-only Resources.
-- Billing plans remain the separate reusable-data resource type `plan`.
CREATE INDEX IF NOT EXISTS idx_mission_plans_company_mission_status_updated
  ON mission_plans(company_id,mission_id,status,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_mission_plans_company_plan_hash
  ON mission_plans(company_id,plan_hash);
CREATE INDEX IF NOT EXISTS idx_mission_plan_evaluations_company_mission_status_expiry
  ON mission_plan_evaluations(company_id,mission_id,status,expires_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_mission_plan_evaluations_company_plan_hash
  ON mission_plan_evaluations(company_id,plan_id,plan_hash,evaluation_hash);
