-- ON Mission 10.30.30 — Durable transition reconciliation intent
-- Stores only non-sensitive, action-specific reconciliation hints. Never store auth secrets.
ALTER TABLE mission_transition_requests ADD COLUMN reconciliation_json TEXT;
CREATE INDEX IF NOT EXISTS idx_transition_requests_uncertain
ON mission_transition_requests(company_id,mission_id,status,mutation_phase,updated_at ASC,id ASC);
