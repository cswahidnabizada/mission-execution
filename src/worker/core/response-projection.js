/**
 * ON Mission 10.32.3 — Canonical Runtime Payload & Projection Efficiency.
 *
 * Projections are allowlists applied only after the authoritative access/query
 * path has produced a row. They reduce transport/serialization cost without
 * becoming an authorization boundary or changing mission truth.
 */

const ROLE_QUEUE_FIELDS = Object.freeze([
  "id","reference","status","state_version","pickup_city","pickup_address",
  "delivery_city","delivery_address","customer_name","company_name",
  "delivery_proof_required","accessKind","source","network_invitation_id",
  "network_invitation_pending","executor_request_pending","executor_access_active",
  "public_enabled","shared_access","distribution_channel","updated_at","created_at"
]);

function pick(row, fields){
  const out={};
  for(const field of fields){
    if(Object.prototype.hasOwnProperty.call(row,field) && row[field]!==undefined) out[field]=row[field];
  }
  return out;
}

export function projectMissionRoleQueue(rows=[]){
  return (Array.isArray(rows)?rows:[]).map(row=>pick(row,ROLE_QUEUE_FIELDS));
}

export function projectPayload(data, projection=""){
  const key=String(projection||"").trim().toLowerCase();
  if(key==="mission-role-queue"){
    if(!data || !Array.isArray(data.missions)) return data;
    return {...data,missions:projectMissionRoleQueue(data.missions)};
  }
  return data;
}

export function payloadByteLength(data){
  try{return new TextEncoder().encode(JSON.stringify(data)).byteLength;}catch{return 0;}
}

export function projectionName(value=""){
  const key=String(value||"").trim().toLowerCase();
  return key==="mission-role-queue"?key:"full";
}
