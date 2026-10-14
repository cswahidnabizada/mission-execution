CREATE TABLE IF NOT EXISTS mission_lifecycle_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  mission_id INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('cancelled','reactivated')),
  reason_code TEXT,
  note TEXT,
  actor_role TEXT NOT NULL,
  actor_identity_id INTEGER,
  actor_name TEXT,
  previous_status TEXT NOT NULL,
  next_status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(mission_id) REFERENCES missions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_mission_lifecycle_events_mission
ON mission_lifecycle_events(company_id,mission_id,created_at DESC,id DESC);

-- Preserve cancellation history already created by V8.0.0.
INSERT INTO mission_lifecycle_events(
  company_id,mission_id,event_type,reason_code,note,actor_role,actor_identity_id,actor_name,
  previous_status,next_status,created_at
)
SELECT mc.company_id,mc.mission_id,'cancelled',mc.reason_code,mc.note,mc.cancelled_by_role,
       mc.cancelled_by_identity_id,mc.cancelled_by_name,mc.mission_status_before,'Cancelled',mc.created_at
FROM mission_cancellations mc
WHERE NOT EXISTS (
  SELECT 1 FROM mission_lifecycle_events mle
  WHERE mle.company_id=mc.company_id AND mle.mission_id=mc.mission_id
    AND mle.event_type='cancelled' AND mle.created_at=mc.created_at
);
