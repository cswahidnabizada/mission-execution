-- ON Mission 10.30.28 — Privacy ON Mission 10.30.30 — Privacy & Data Governance foundation. Data Governance foundation.
-- Operational audit records have configurable retention; canonical mission
-- event records remain authoritative and are not purged by this policy.
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_expires ON action_execution_telemetry(expires_at);
