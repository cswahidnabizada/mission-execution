-- 0105 — Canonical Logistics Physical Cleanup — Wave 5
-- The logistics runtime has been fully migrated to mission_stops and mission_objects.
-- The compatibility triggers were retired in 0104 and the canonical projection
-- no longer reads legacy missions logistics columns. This migration removes the
-- frozen physical compatibility columns and their obsolete indexes.

DROP INDEX IF EXISTS idx_missions_delivery_city;
DROP INDEX IF EXISTS idx_missions_pickup_city;
DROP INDEX IF EXISTS idx_missions_route_points;

ALTER TABLE missions DROP COLUMN pickup_company;
ALTER TABLE missions DROP COLUMN pickup_address;
ALTER TABLE missions DROP COLUMN delivery_company;
ALTER TABLE missions DROP COLUMN delivery_address;
ALTER TABLE missions DROP COLUMN pickup_access_from;
ALTER TABLE missions DROP COLUMN pickup_access_to;
ALTER TABLE missions DROP COLUMN delivery_access_from;
ALTER TABLE missions DROP COLUMN delivery_access_to;
ALTER TABLE missions DROP COLUMN pickup_street;
ALTER TABLE missions DROP COLUMN pickup_zip_code;
ALTER TABLE missions DROP COLUMN pickup_city;
ALTER TABLE missions DROP COLUMN delivery_street;
ALTER TABLE missions DROP COLUMN delivery_zip_code;
ALTER TABLE missions DROP COLUMN delivery_city;
ALTER TABLE missions DROP COLUMN pickup_latitude;
ALTER TABLE missions DROP COLUMN pickup_longitude;
ALTER TABLE missions DROP COLUMN delivery_latitude;
ALTER TABLE missions DROP COLUMN delivery_longitude;
ALTER TABLE missions DROP COLUMN object_type;
ALTER TABLE missions DROP COLUMN object_description;
ALTER TABLE missions DROP COLUMN weight_kg;
ALTER TABLE missions DROP COLUMN volume_m3;
ALTER TABLE missions DROP COLUMN pallet_count;
ALTER TABLE missions DROP COLUMN vehicle_requirement;
ALTER TABLE missions DROP COLUMN loading_type;
ALTER TABLE missions DROP COLUMN unloading_type;
ALTER TABLE missions DROP COLUMN matching_notes;
