ALTER TABLE public_mission_requests ADD COLUMN custody_driver_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_public_requests_custody_driver
ON public_mission_requests(company_id,mission_id,custody_driver_id,status);
