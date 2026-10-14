-- V8.6.8 Phase 1 adversarial API/resource isolation.
-- One mission may have only one active direct Network invitation at a time.
-- Service logic already enforces this; this migration closes the concurrent
-- insert race at the D1 boundary.

-- If an accepted invitation exists, any still-pending invitation for the same
-- owner mission is stale and can no longer be accepted safely.
UPDATE network_mission_invitations AS pending
SET status='Cancelled', responded_at=COALESCE(responded_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP
WHERE pending.status='Pending'
  AND EXISTS (
    SELECT 1 FROM network_mission_invitations accepted
    WHERE accepted.owner_company_id=pending.owner_company_id
      AND accepted.mission_id=pending.mission_id
      AND accepted.status='Accepted'
  );

-- For legacy duplicate Pending rows, preserve the oldest invitation and cancel
-- later duplicates before adding the database invariant.
UPDATE network_mission_invitations
SET status='Cancelled', responded_at=COALESCE(responded_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP
WHERE status='Pending'
  AND id NOT IN (
    SELECT MIN(id)
    FROM network_mission_invitations
    WHERE status='Pending'
    GROUP BY owner_company_id,mission_id
  );

-- If legacy data contains multiple Accepted invitations for one mission this
-- CREATE INDEX intentionally fails. That is a real execution-ownership breach
-- and must be repaired explicitly rather than silently deleting responsibility.
CREATE UNIQUE INDEX IF NOT EXISTS idx_network_one_active_invitation_per_mission
ON network_mission_invitations(owner_company_id,mission_id)
WHERE status IN ('Pending','Accepted');
