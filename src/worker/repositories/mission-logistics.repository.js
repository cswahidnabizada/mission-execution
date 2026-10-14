import {canonicalFirst, canonicalAll} from "../core/canonical-db.js";

export function normalizeMissionLogistics(data={}){
  const pickup={
    stopType:"pickup",status:"pending",companyName:data.pickupCompany||null,
    addressLine1:data.pickupStreet||data.pickupAddress||null,postalCode:data.pickupZipCode||null,city:data.pickupCity||null,
    latitude:data.pickupLatitude??null,longitude:data.pickupLongitude??null,
    accessFrom:data.pickupAccessFrom||null,accessTo:data.pickupAccessTo||null
  };
  const delivery={
    stopType:"delivery",status:"pending",companyName:data.deliveryCompany||null,
    addressLine1:data.deliveryStreet||data.deliveryAddress||null,postalCode:data.deliveryZipCode||null,city:data.deliveryCity||null,
    latitude:data.deliveryLatitude??null,longitude:data.deliveryLongitude??null,
    accessFrom:data.deliveryAccessFrom||null,accessTo:data.deliveryAccessTo||null
  };
  const object = (data.objectType||data.objectDescription||data.weightKg!=null||data.volumeM3!=null||data.palletCount!=null)
    ? {objectType:data.objectType||"generic_object",description:data.objectDescription||null,weightKg:data.weightKg??null,volumeM3:data.volumeM3??null,palletCount:data.palletCount??null,requirements:{vehicle:data.vehicleRequirement||null,loading:data.loadingType||null,unloading:data.unloadingType||null,matchingNotes:data.matchingNotes||null}}
    : null;
  return {pickup,delivery,object};
}

export async function getMissionLogistics(env, companyId, missionId){
  const row=await canonicalFirst(env,`SELECT
    (SELECT json_object('id',id,'stopType',stop_type,'status',status,'companyName',company_name,'contactName',contact_name,'contactPhone',contact_phone,'addressLine1',address_line1,'addressLine2',address_line2,'postalCode',postal_code,'city',city,'region',region,'latitude',latitude,'longitude',longitude,'accessFrom',access_from,'accessTo',access_to,'plannedArrivalAt',planned_arrival_at,'plannedDepartureAt',planned_departure_at,'estimatedArrivalAt',estimated_arrival_at,'actualArrivalAt',actual_arrival_at,'actualDepartureAt',actual_departure_at,'instructions',instructions,'evidenceRequired',evidence_required) FROM mission_stops WHERE company_id=? AND mission_id=? AND stop_type='pickup' ORDER BY sequence_no LIMIT 1) AS pickup_json,
    (SELECT json_object('id',id,'stopType',stop_type,'status',status,'companyName',company_name,'contactName',contact_name,'contactPhone',contact_phone,'addressLine1',address_line1,'addressLine2',address_line2,'postalCode',postal_code,'city',city,'region',region,'latitude',latitude,'longitude',longitude,'accessFrom',access_from,'accessTo',access_to,'plannedArrivalAt',planned_arrival_at,'plannedDepartureAt',planned_departure_at,'estimatedArrivalAt',estimated_arrival_at,'actualArrivalAt',actual_arrival_at,'actualDepartureAt',actual_departure_at,'instructions',instructions,'evidenceRequired',evidence_required) FROM mission_stops WHERE company_id=? AND mission_id=? AND stop_type='delivery' ORDER BY sequence_no DESC LIMIT 1) AS delivery_json,
    (SELECT json_object('id',id,'objectType',object_type,'description',description,'weightKg',weight_kg,'volumeM3',volume_m3,'palletCount',pallet_count,'identifiersJson',identifiers_json,'requirementsJson',requirements_json) FROM mission_objects WHERE company_id=? AND mission_id=? ORDER BY sequence_no LIMIT 1) AS object_json
    FROM mission_canonical_projection WHERE company_id=? AND id=? LIMIT 1`,[companyId,missionId,companyId,missionId,companyId,missionId,companyId,missionId],'mission.logistics.read');
  const parse=v=>v?JSON.parse(v):null;
  const pickup=parse(row?.pickup_json),delivery=parse(row?.delivery_json),object=parse(row?.object_json);
  return {pickup,delivery,object,hasCanonicalStops:Boolean(pickup||delivery),hasCanonicalObject:Boolean(object)};
}

export async function listMissionObjects(env, companyId, limit=200){
  return canonicalAll(env,`SELECT o.id,o.mission_id,m.reference,o.object_type,o.description AS object_description,o.weight_kg,o.volume_m3,o.pallet_count,o.requirements_json,m.status,m.updated_at
    FROM mission_objects o JOIN mission_canonical_projection m ON m.id=o.mission_id AND m.company_id=o.company_id
    WHERE o.company_id=? ORDER BY m.updated_at DESC,o.sequence_no LIMIT ?`,[companyId,limit],'mission.objects.list');
}

export function canonicalLogisticsStatements(env, {companyId, missionId, data}){
  const sector=String(data?.sectorCode||"logistics").toLowerCase();
  const capability=String(data?.capabilityCode||"").toLowerCase();
  if(sector!=="logistics" && capability!=="logistics") return [
    env.DB.prepare(`DELETE FROM mission_stops WHERE company_id=? AND mission_id=?`).bind(companyId,missionId),
    env.DB.prepare(`DELETE FROM mission_objects WHERE company_id=? AND mission_id=?`).bind(companyId,missionId)
  ];
  const {pickup,delivery,object}=normalizeMissionLogistics(data);
  const statements=[
    env.DB.prepare(`DELETE FROM mission_stops WHERE company_id=? AND mission_id=?`).bind(companyId,missionId),
    env.DB.prepare(`INSERT INTO mission_stops(company_id,mission_id,sequence_no,stop_type,status,company_name,address_line1,postal_code,city,latitude,longitude,access_from,access_to) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(companyId,missionId,1,pickup.stopType,pickup.status,pickup.companyName,pickup.addressLine1,pickup.postalCode,pickup.city,pickup.latitude,pickup.longitude,pickup.accessFrom,pickup.accessTo),
    env.DB.prepare(`INSERT INTO mission_stops(company_id,mission_id,sequence_no,stop_type,status,company_name,address_line1,postal_code,city,latitude,longitude,access_from,access_to) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(companyId,missionId,2,delivery.stopType,delivery.status,delivery.companyName,delivery.addressLine1,delivery.postalCode,delivery.city,delivery.latitude,delivery.longitude,delivery.accessFrom,delivery.accessTo),
    env.DB.prepare(`DELETE FROM mission_objects WHERE company_id=? AND mission_id=?`).bind(companyId,missionId)
  ];
  if(object) statements.push(env.DB.prepare(`INSERT INTO mission_objects(company_id,mission_id,sequence_no,object_type,description,weight_kg,volume_m3,pallet_count,requirements_json) VALUES (?,?,?,?,?,?,?,?,?)`).bind(companyId,missionId,1,object.objectType,object.description,object.weightKg,object.volumeM3,object.palletCount,JSON.stringify(object.requirements)));
  return statements;
}
