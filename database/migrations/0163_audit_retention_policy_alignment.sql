-- 0163: Align audit-log deletion guard with the declared 365-day retention policy.
-- Migration 0162's 30-day floor did not enforce wrangler.jsonc AUDIT_RETENTION_DAYS=365.
-- Audit records remain immutable; deletion is permitted only after the policy window.
DROP TRIGGER IF EXISTS trg_audit_logs_no_early_delete;
CREATE TRIGGER trg_audit_logs_no_early_delete
BEFORE DELETE ON audit_logs
WHEN OLD.created_at > datetime('now','-365 days')
BEGIN
  SELECT RAISE(ABORT,'AUDIT_LOG_RETENTION_FLOOR');
END;
