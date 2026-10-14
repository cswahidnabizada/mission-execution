-- ON Mission 10.43.0 — Canonical Logistics Authority Wave 1
-- mission_stops and mission_objects become the authoritative logistics model.
-- Existing missions.* logistics columns remain only as temporary compatibility projections.

INSERT OR IGNORE INTO mission_stops(
  company_id,mission_id,sequence_no,stop_type,status,company_name,address_line1,postal_code,city,latitude,longitude,access_from,access_to
)
SELECT company_id,id,1,'pickup','pending',pickup_company,
       COALESCE(NULLIF(pickup_street,''),NULLIF(pickup_address,'')),pickup_zip_code,pickup_city,
       pickup_latitude,pickup_longitude,pickup_access_from,pickup_access_to
FROM missions
WHERE pickup_company IS NOT NULL OR pickup_address IS NOT NULL OR pickup_street IS NOT NULL OR pickup_city IS NOT NULL;

INSERT OR IGNORE INTO mission_stops(
  company_id,mission_id,sequence_no,stop_type,status,company_name,address_line1,postal_code,city,latitude,longitude,access_from,access_to
)
SELECT company_id,id,2,'delivery','pending',delivery_company,
       COALESCE(NULLIF(delivery_street,''),NULLIF(delivery_address,'')),delivery_zip_code,delivery_city,
       delivery_latitude,delivery_longitude,delivery_access_from,delivery_access_to
FROM missions
WHERE delivery_company IS NOT NULL OR delivery_address IS NOT NULL OR delivery_street IS NOT NULL OR delivery_city IS NOT NULL;

INSERT OR IGNORE INTO mission_objects(
  company_id,mission_id,sequence_no,object_type,description,weight_kg,volume_m3,pallet_count,requirements_json
)
SELECT company_id,id,1,COALESCE(NULLIF(object_type,''),'generic_object'),object_description,weight_kg,volume_m3,pallet_count,
       json_object('vehicle',vehicle_requirement,'loading',loading_type,'unloading',unloading_type,'matchingNotes',matching_notes)
FROM missions
WHERE object_type IS NOT NULL OR object_description IS NOT NULL OR weight_kg IS NOT NULL OR volume_m3 IS NOT NULL OR pallet_count IS NOT NULL;

-- Temporary compatibility projection: old readers can continue to operate while consumers migrate.
DROP TRIGGER IF EXISTS trg_mission_stops_legacy_projection;
CREATE TRIGGER trg_mission_stops_legacy_projection AFTER INSERT ON mission_stops
BEGIN
  UPDATE missions SET
    pickup_company=CASE WHEN NEW.stop_type='pickup' THEN NEW.company_name ELSE pickup_company END,
    pickup_address=CASE WHEN NEW.stop_type='pickup' THEN NEW.address_line1 ELSE pickup_address END,
    pickup_street=CASE WHEN NEW.stop_type='pickup' THEN NEW.address_line1 ELSE pickup_street END,
    pickup_zip_code=CASE WHEN NEW.stop_type='pickup' THEN NEW.postal_code ELSE pickup_zip_code END,
    pickup_city=CASE WHEN NEW.stop_type='pickup' THEN NEW.city ELSE pickup_city END,
    pickup_latitude=CASE WHEN NEW.stop_type='pickup' THEN NEW.latitude ELSE pickup_latitude END,
    pickup_longitude=CASE WHEN NEW.stop_type='pickup' THEN NEW.longitude ELSE pickup_longitude END,
    pickup_access_from=CASE WHEN NEW.stop_type='pickup' THEN NEW.access_from ELSE pickup_access_from END,
    pickup_access_to=CASE WHEN NEW.stop_type='pickup' THEN NEW.access_to ELSE pickup_access_to END,
    delivery_company=CASE WHEN NEW.stop_type='delivery' THEN NEW.company_name ELSE delivery_company END,
    delivery_address=CASE WHEN NEW.stop_type='delivery' THEN NEW.address_line1 ELSE delivery_address END,
    delivery_street=CASE WHEN NEW.stop_type='delivery' THEN NEW.address_line1 ELSE delivery_street END,
    delivery_zip_code=CASE WHEN NEW.stop_type='delivery' THEN NEW.postal_code ELSE delivery_zip_code END,
    delivery_city=CASE WHEN NEW.stop_type='delivery' THEN NEW.city ELSE delivery_city END,
    delivery_latitude=CASE WHEN NEW.stop_type='delivery' THEN NEW.latitude ELSE delivery_latitude END,
    delivery_longitude=CASE WHEN NEW.stop_type='delivery' THEN NEW.longitude ELSE delivery_longitude END,
    delivery_access_from=CASE WHEN NEW.stop_type='delivery' THEN NEW.access_from ELSE delivery_access_from END,
    delivery_access_to=CASE WHEN NEW.stop_type='delivery' THEN NEW.access_to ELSE delivery_access_to END,
    updated_at=CURRENT_TIMESTAMP
  WHERE id=NEW.mission_id AND company_id=NEW.company_id;
END;

DROP TRIGGER IF EXISTS trg_mission_objects_legacy_projection;
CREATE TRIGGER trg_mission_objects_legacy_projection AFTER INSERT ON mission_objects
BEGIN
  UPDATE missions SET
    object_type=NEW.object_type,
    object_description=NEW.description,
    weight_kg=NEW.weight_kg,
    volume_m3=NEW.volume_m3,
    pallet_count=NEW.pallet_count,
    vehicle_requirement=json_extract(NEW.requirements_json,'$.vehicle'),
    loading_type=json_extract(NEW.requirements_json,'$.loading'),
    unloading_type=json_extract(NEW.requirements_json,'$.unloading'),
    matching_notes=json_extract(NEW.requirements_json,'$.matchingNotes'),
    updated_at=CURRENT_TIMESTAMP
  WHERE id=NEW.mission_id AND company_id=NEW.company_id;
END;

DROP TRIGGER IF EXISTS trg_mission_stops_legacy_projection_delete;
CREATE TRIGGER trg_mission_stops_legacy_projection_delete AFTER DELETE ON mission_stops
BEGIN
  UPDATE missions SET
    pickup_company=CASE WHEN OLD.stop_type='pickup' THEN NULL ELSE pickup_company END,
    pickup_address=CASE WHEN OLD.stop_type='pickup' THEN NULL ELSE pickup_address END,
    pickup_street=CASE WHEN OLD.stop_type='pickup' THEN NULL ELSE pickup_street END,
    pickup_zip_code=CASE WHEN OLD.stop_type='pickup' THEN NULL ELSE pickup_zip_code END,
    pickup_city=CASE WHEN OLD.stop_type='pickup' THEN NULL ELSE pickup_city END,
    pickup_latitude=CASE WHEN OLD.stop_type='pickup' THEN NULL ELSE pickup_latitude END,
    pickup_longitude=CASE WHEN OLD.stop_type='pickup' THEN NULL ELSE pickup_longitude END,
    pickup_access_from=CASE WHEN OLD.stop_type='pickup' THEN NULL ELSE pickup_access_from END,
    pickup_access_to=CASE WHEN OLD.stop_type='pickup' THEN NULL ELSE pickup_access_to END,
    delivery_company=CASE WHEN OLD.stop_type='delivery' THEN NULL ELSE delivery_company END,
    delivery_address=CASE WHEN OLD.stop_type='delivery' THEN NULL ELSE delivery_address END,
    delivery_street=CASE WHEN OLD.stop_type='delivery' THEN NULL ELSE delivery_street END,
    delivery_zip_code=CASE WHEN OLD.stop_type='delivery' THEN NULL ELSE delivery_zip_code END,
    delivery_city=CASE WHEN OLD.stop_type='delivery' THEN NULL ELSE delivery_city END,
    delivery_latitude=CASE WHEN OLD.stop_type='delivery' THEN NULL ELSE delivery_latitude END,
    delivery_longitude=CASE WHEN OLD.stop_type='delivery' THEN NULL ELSE delivery_longitude END,
    delivery_access_from=CASE WHEN OLD.stop_type='delivery' THEN NULL ELSE delivery_access_from END,
    delivery_access_to=CASE WHEN OLD.stop_type='delivery' THEN NULL ELSE delivery_access_to END,
    updated_at=CURRENT_TIMESTAMP
  WHERE id=OLD.mission_id AND company_id=OLD.company_id;
END;

DROP TRIGGER IF EXISTS trg_mission_objects_legacy_projection_delete;
CREATE TRIGGER trg_mission_objects_legacy_projection_delete AFTER DELETE ON mission_objects
BEGIN
  UPDATE missions SET
    object_type=NULL,object_description=NULL,weight_kg=NULL,volume_m3=NULL,pallet_count=NULL,
    vehicle_requirement=NULL,loading_type=NULL,unloading_type=NULL,matching_notes=NULL,
    updated_at=CURRENT_TIMESTAMP
  WHERE id=OLD.mission_id AND company_id=OLD.company_id;
END;
