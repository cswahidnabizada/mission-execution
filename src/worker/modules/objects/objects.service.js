import {listMissionObjects as listCanonicalMissionObjects} from "../../repositories/mission-logistics.repository.js";

export async function listMissionObjects(env,session){
  const tenantId=Number(session.tenantId||0);
  if(!tenantId)return [];
  const rows=await listCanonicalMissionObjects(env,tenantId,200);
  return (rows||[]).map(r=>({id:`mission-object:${r.id}`,missionId:Number(r.mission_id),reference:r.reference||null,type:String(r.object_type||"generic_object"),description:r.object_description||null,weightKg:r.weight_kg==null?null:Number(r.weight_kg),volumeM3:r.volume_m3==null?null:Number(r.volume_m3),palletCount:r.pallet_count==null?null:Number(r.pallet_count),resourceRequirement:(()=>{try{return JSON.parse(r.requirements_json||"{}").vehicle||null}catch{return null}})(),missionStatus:r.status||null,capability:String(r.object_type||"").toLowerCase().includes("cargo")?"logistics":"object",updatedAt:r.updated_at||null}));
}
