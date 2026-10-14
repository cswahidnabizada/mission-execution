-- V8.6.4: old advisory Mission Management requirements must not survive as
-- completion blockers or command clutter. Dedicated location/navigation
-- surfaces remain available outside Mission Management.
UPDATE mission_management_requirements
SET status='cancelled',updated_at=CURRENT_TIMESTAMP
WHERE status='open'
  AND code IN ('current_location','traffic_resolution','waiting_resolution');
