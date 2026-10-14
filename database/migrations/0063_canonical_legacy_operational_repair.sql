-- ON Mission 10.31.96 — Canonical legacy operational repair
-- Idempotent repair for missions created before the canonical state contract.
-- Keeps historical rows intact while ensuring every mission has a usable state token
-- and at least one canonical lifecycle history row.
UPDATE missions SET state_version=1 WHERE COALESCE(state_version,0)<=0;
UPDATE missions SET updated_at=COALESCE(updated_at,created_at,CURRENT_TIMESTAMP) WHERE updated_at IS NULL OR updated_at='';
UPDATE missions SET status_changed_at=COALESCE(status_changed_at,updated_at,created_at,CURRENT_TIMESTAMP) WHERE status_changed_at IS NULL OR status_changed_at='';
INSERT INTO mission_status_history(mission_id,status,created_at)
SELECT m.id,m.status,COALESCE(m.status_changed_at,m.updated_at,m.created_at,CURRENT_TIMESTAMP)
FROM missions m
WHERE NOT EXISTS (SELECT 1 FROM mission_status_history h WHERE h.mission_id=m.id);
CREATE INDEX IF NOT EXISTS idx_missions_company_state_version ON missions(company_id,state_version,id);
