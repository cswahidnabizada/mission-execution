-- ON Mission 10.31.95
-- Reconcile missions created before canonical lifecycle/action enforcement.
-- This migration is deliberately non-destructive: it normalizes missing canonical
-- version metadata and backfills the first status-history record where absent.

UPDATE missions
SET state_version=CASE WHEN COALESCE(state_version,0)<1 THEN 1 ELSE state_version END,
    status_changed_at=COALESCE(status_changed_at,created_at,updated_at,CURRENT_TIMESTAMP),
    updated_at=COALESCE(updated_at,created_at,CURRENT_TIMESTAMP)
WHERE COALESCE(state_version,0)<1 OR status_changed_at IS NULL;

INSERT INTO mission_status_history(mission_id,status,created_at)
SELECT m.id,m.status,COALESCE(m.status_changed_at,m.created_at,m.updated_at,CURRENT_TIMESTAMP)
FROM missions m
WHERE m.status IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM mission_status_history h WHERE h.mission_id=m.id);

CREATE INDEX IF NOT EXISTS idx_missions_company_state_version ON missions(company_id,state_version,id);
