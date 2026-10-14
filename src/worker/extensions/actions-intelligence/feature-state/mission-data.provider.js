const REQUIRED=Object.freeze([
  ["pickup_company","pickup_company"],["delivery_company","delivery_company"],["mission_date","mission_date"],
  ["pickup_at_utc","pickup_at_utc"],["delivery_at_utc","delivery_at_utc"],["deadline_at_utc","deadline_at_utc"]
]);
export function missionDataState(mission={}){
  const missing=missingFields(REQUIRED,mission);
  const pickupReady=addressReady(mission,"pickup"),deliveryReady=addressReady(mission,"delivery");
  const missingExecution=[...(!pickupReady?["pickup_address_missing"]:[]),...(!deliveryReady?["delivery_address_missing"]:[])];
  return Object.freeze({
    feature:"mission_data",complete:missing.length===0&&missingExecution.length===0,
    executionReady:missingExecution.length===0,missingRequired:Object.freeze(missing),
    missingExecutionRequired:Object.freeze(missingExecution),repairable:true,
    route:Object.freeze({
      pickup:Object.freeze({street:mission.pickup_street||null,zipCode:mission.pickup_zip_code||null,city:mission.pickup_city||null,address:mission.pickup_address||null}),
      delivery:Object.freeze({street:mission.delivery_street||null,zipCode:mission.delivery_zip_code||null,city:mission.delivery_city||null,address:mission.delivery_address||null})
    }),
    cargo:Object.freeze({type:mission.object_type||null,description:mission.object_description||null,weightKg:mission.weight_kg??null,volumeM3:mission.volume_m3??null,palletCount:mission.pallet_count??null}),
    requirements:Object.freeze({vehicle:mission.vehicle_requirement||null,loading:mission.loading_type||null,unloading:mission.unloading_type||null,matchingNotes:mission.matching_notes||null})
  });
}
function addressReady(m,prefix){return Boolean(String(m?.[`${prefix}_address`]||"").trim())||Boolean(String(m?.[`${prefix}_street`]||"").trim()&&String(m?.[`${prefix}_zip_code`]||"").trim()&&String(m?.[`${prefix}_city`]||"").trim());}
function missingFields(spec,mission){return spec.filter(([,field])=>!present(mission[field])).map(([name])=>name);}
function present(v){return v!==null&&v!==undefined&&String(v).trim()!=="";}
