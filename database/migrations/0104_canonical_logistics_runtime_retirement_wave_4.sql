-- 0104 — Canonical Logistics Runtime Retirement — Wave 4
-- All application read consumers have converged on mission_canonical_projection.
-- mission_stops and mission_objects are now the only runtime logistics authority.
-- Legacy missions.* logistics columns remain frozen compatibility storage until
-- the final column-removal wave after production verification.

DROP TRIGGER IF EXISTS trg_mission_stops_legacy_projection;
DROP TRIGGER IF EXISTS trg_mission_objects_legacy_projection;
DROP TRIGGER IF EXISTS trg_mission_stops_legacy_projection_delete;
DROP TRIGGER IF EXISTS trg_mission_objects_legacy_projection_delete;

DROP VIEW IF EXISTS mission_canonical_projection;
CREATE VIEW mission_canonical_projection AS
SELECT
  m.id,m.company_id,m.driver_id,m.reference,
  ps.company_name AS pickup_company,
  ps.address_line1 AS pickup_address,
  ds.company_name AS delivery_company,
  ds.address_line1 AS delivery_address,
  m.mission_date,m.status,m.public_enabled,m.public_description,m.created_at,m.updated_at,
  m.mission_end_time,m.pickup_time,m.delivery_time,m.deadline_at,m.pickup_at_utc,m.delivery_at_utc,m.deadline_at_utc,m.schedule_timezone,
  m.status_changed_at,m.delivery_proof_required,m.customer_id,
  ps.access_from AS pickup_access_from,
  ps.access_to AS pickup_access_to,
  ds.access_from AS delivery_access_from,
  ds.access_to AS delivery_access_to,
  m.state_version,m.state_lock_token,m.state_lock_at,
  ps.address_line1 AS pickup_street,
  ps.postal_code AS pickup_zip_code,
  ps.city AS pickup_city,
  ds.address_line1 AS delivery_street,
  ds.postal_code AS delivery_zip_code,
  ds.city AS delivery_city,
  ps.latitude AS pickup_latitude,
  ps.longitude AS pickup_longitude,
  ds.latitude AS delivery_latitude,
  ds.longitude AS delivery_longitude,
  o.object_type AS object_type,
  o.description AS object_description,
  o.weight_kg AS weight_kg,
  o.volume_m3 AS volume_m3,
  o.pallet_count AS pallet_count,
  json_extract(o.requirements_json,'$.vehicle') AS vehicle_requirement,
  json_extract(o.requirements_json,'$.loading') AS loading_type,
  json_extract(o.requirements_json,'$.unloading') AS unloading_type,
  json_extract(o.requirements_json,'$.matchingNotes') AS matching_notes,
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
