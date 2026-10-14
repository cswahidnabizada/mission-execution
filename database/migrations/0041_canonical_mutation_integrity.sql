-- ON Mission 10.29.40 — Canonical Mutation Integrity & Transactional Truth
-- Durable mutation phase makes successful domain mutations recoverable if the final
-- event/idempotency acknowledgement is interrupted.
ALTER TABLE mission_transition_requests ADD COLUMN mutation_phase TEXT NOT NULL DEFAULT 'processing';
CREATE INDEX IF NOT EXISTS idx_transition_requests_reconciliation
ON mission_transition_requests(company_id,mission_id,status,mutation_phase,updated_at ASC,id ASC);
CREATE INDEX IF NOT EXISTS idx_event_ledger_transition_outcome
ON mission_event_ledger(transition_key,outcome,updated_at DESC);
