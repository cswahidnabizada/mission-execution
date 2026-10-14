-- ON Mission 9.9.9 — Mission Marketplace Data Foundation
-- Additive only. Existing address/schedule fields remain authoritative compatibility fields.
ALTER TABLE missions ADD COLUMN pickup_street TEXT;
ALTER TABLE missions ADD COLUMN pickup_zip_code TEXT;
ALTER TABLE missions ADD COLUMN pickup_city TEXT;
ALTER TABLE missions ADD COLUMN delivery_street TEXT;
ALTER TABLE missions ADD COLUMN delivery_zip_code TEXT;
ALTER TABLE missions ADD COLUMN delivery_city TEXT;
ALTER TABLE missions ADD COLUMN pickup_latitude REAL;
ALTER TABLE missions ADD COLUMN pickup_longitude REAL;
ALTER TABLE missions ADD COLUMN delivery_latitude REAL;
ALTER TABLE missions ADD COLUMN delivery_longitude REAL;
ALTER TABLE missions ADD COLUMN object_type TEXT;
ALTER TABLE missions ADD COLUMN object_description TEXT;
ALTER TABLE missions ADD COLUMN weight_kg REAL;
ALTER TABLE missions ADD COLUMN volume_m3 REAL;
ALTER TABLE missions ADD COLUMN pallet_count INTEGER;
ALTER TABLE missions ADD COLUMN vehicle_requirement TEXT;
ALTER TABLE missions ADD COLUMN loading_type TEXT;
ALTER TABLE missions ADD COLUMN unloading_type TEXT;
ALTER TABLE missions ADD COLUMN matching_notes TEXT;
CREATE INDEX IF NOT EXISTS idx_missions_pickup_city ON missions(company_id,pickup_city);
CREATE INDEX IF NOT EXISTS idx_missions_delivery_city ON missions(company_id,delivery_city);
CREATE INDEX IF NOT EXISTS idx_missions_route_points ON missions(pickup_latitude,pickup_longitude,delivery_latitude,delivery_longitude);
