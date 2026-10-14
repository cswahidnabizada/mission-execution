-- 0103 — Canonical Logistics Read Projection — Wave 2
-- Canonical sources: mission_stops + mission_objects.
-- missions remains the mission lifecycle authority; this view only supplies
-- canonical logistics fields to read consumers while legacy columns remain
-- as temporary compatibility storage until their consumers reach zero.
DROP VIEW IF EXISTS mission_canonical_projection;
CREATE VIEW mission_canonical_projection AS
SELECT
  m.id,m.company_id,m.driver_id,m.reference,
  COALESCE(ps.company_name,m.pickup_company) AS pickup_company,
  COALESCE(ps.address_line1,m.pickup_address) AS pickup_address,
  COALESCE(ds.company_name,m.delivery_company) AS delivery_company,
  COALESCE(ds.address_line1,m.delivery_address) AS delivery_address,
  m.mission_date,m.status,m.public_enabled,m.public_description,m.created_at,m.updated_at,
  m.mission_end_time,m.pickup_time,m.delivery_time,m.deadline_at,m.pickup_at_utc,m.delivery_at_utc,m.deadline_at_utc,m.schedule_timezone,
  m.status_changed_at,m.delivery_proof_required,m.customer_id,
  COALESCE(ps.access_from,m.pickup_access_from) AS pickup_access_from,
  COALESCE(ps.access_to,m.pickup_access_to) AS pickup_access_to,
  COALESCE(ds.access_from,m.delivery_access_from) AS delivery_access_from,
  COALESCE(ds.access_to,m.delivery_access_to) AS delivery_access_to,
  m.state_version,m.state_lock_token,m.state_lock_at,
  COALESCE(ps.address_line1,m.pickup_street) AS pickup_street,
  COALESCE(ps.postal_code,m.pickup_zip_code) AS pickup_zip_code,
  COALESCE(ps.city,m.pickup_city) AS pickup_city,
  COALESCE(ds.address_line1,m.delivery_street) AS delivery_street,
  COALESCE(ds.postal_code,m.delivery_zip_code) AS delivery_zip_code,
  COALESCE(ds.city,m.delivery_city) AS delivery_city,
  COALESCE(ps.latitude,m.pickup_latitude) AS pickup_latitude,
  COALESCE(ps.longitude,m.pickup_longitude) AS pickup_longitude,
  COALESCE(ds.latitude,m.delivery_latitude) AS delivery_latitude,
  COALESCE(ds.longitude,m.delivery_longitude) AS delivery_longitude,
  COALESCE(o.object_type,m.object_type) AS object_type,
  COALESCE(o.description,m.object_description) AS object_description,
  COALESCE(o.weight_kg,m.weight_kg) AS weight_kg,
  COALESCE(o.volume_m3,m.volume_m3) AS volume_m3,
  COALESCE(o.pallet_count,m.pallet_count) AS pallet_count,
  COALESCE(json_extract(o.requirements_json,'$.vehicle'),m.vehicle_requirement) AS vehicle_requirement,
  COALESCE(json_extract(o.requirements_json,'$.loading'),m.loading_type) AS loading_type,
  COALESCE(json_extract(o.requirements_json,'$.unloading'),m.unloading_type) AS unloading_type,
  COALESCE(json_extract(o.requirements_json,'$.matchingNotes'),m.matching_notes) AS matching_notes,
  m.capability_code,m.objective,m.responsibility_mode,m.country_code,m.sector_code,m.product_definition_id,m.lifecycle_definition_id,m.lifecycle_state_code,
  m.archived_at,m.archived_by_identity_id,m.archive_reason
FROM missions m
LEFT JOIN mission_stops ps
  ON ps.company_id=m.company_id AND ps.mission_id=m.id AND ps.stop_type='pickup'
  AND ps.id=(SELECT x.id FROM mission_stops x WHERE x.company_id=m.company_id AND x.mission_id=m.id AND x.stop_type='pickup' ORDER BY x.sequence_no LIMIT 1)
LEFT JOIN mission_stops ds
  ON ds.company_id=m.company_id AND ds.mission_id=m.id AND ds.stop_type='delivery'
  AND ds.id=(SELECT x.id FROM mission_stops x WHERE x.company_id=m.company_id AND x.mission_id=m.id AND x.stop_type='delivery' ORDER BY x.sequence_no DESC LIMIT 1)
LEFT JOIN mission_objects o
  ON o.company_id=m.company_id AND o.mission_id=m.id
  AND o.id=(SELECT x.id FROM mission_objects x WHERE x.company_id=m.company_id AND x.mission_id=m.id ORDER BY x.sequence_no LIMIT 1);
