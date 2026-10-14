-- V7.6.2: accurate event-time tracking for ForYou request state changes.
ALTER TABLE public_mission_requests ADD COLUMN updated_at TEXT;
UPDATE public_mission_requests SET updated_at=COALESCE(updated_at,created_at,CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_public_requests_updated_at ON public_mission_requests(updated_at DESC);
