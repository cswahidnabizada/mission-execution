-- 0162: Tamper-resistance for audit evidence.
-- admin_control_audit_events: strictly append-only (never updated, never deleted).
-- audit_logs: never updated; rows may be deleted only after the minimum retention floor
-- (30 days, the lowest value privacy.service retentionDays() accepts), so the scheduled
-- retention purge keeps working while recent evidence cannot be removed.
CREATE TRIGGER IF NOT EXISTS trg_admin_control_audit_events_no_update BEFORE UPDATE ON admin_control_audit_events BEGIN SELECT RAISE(ABORT,'AUDIT_EVENTS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_admin_control_audit_events_no_delete BEFORE DELETE ON admin_control_audit_events BEGIN SELECT RAISE(ABORT,'AUDIT_EVENTS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT,'AUDIT_LOG_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_early_delete BEFORE DELETE ON audit_logs WHEN OLD.created_at > datetime('now','-30 days') BEGIN SELECT RAISE(ABORT,'AUDIT_LOG_RETENTION_FLOOR'); END;
