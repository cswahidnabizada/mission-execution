-- V7.2: public mission request queue control.
-- One publisher-facing pending request at a time per mission.
-- Existing extra pending requests are declined safely before the unique index is created.

UPDATE public_mission_requests
SET status='Declined'
WHERE status='Pending'
  AND id NOT IN (
    SELECT MIN(id)
    FROM public_mission_requests
    WHERE status='Pending'
    GROUP BY mission_id
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_requests_one_pending_per_mission
ON public_mission_requests(mission_id)
WHERE status='Pending';
