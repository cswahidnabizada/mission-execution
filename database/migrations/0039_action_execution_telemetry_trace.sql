-- Telemetry correlation upgrade. Diagnostic only; never used by mission truth.
ALTER TABLE action_execution_telemetry ADD COLUMN trace_id TEXT;
ALTER TABLE action_execution_telemetry ADD COLUMN event_sequence INTEGER;
CREATE INDEX IF NOT EXISTS idx_action_execution_telemetry_trace
  ON action_execution_telemetry(company_id,trace_id,event_sequence);
