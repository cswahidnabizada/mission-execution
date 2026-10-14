export async function ensureProfile(env,executorId){
  await env.DB.prepare(`INSERT INTO executor_operational_profiles(executor_id) VALUES (?) ON CONFLICT(executor_id) DO NOTHING`).bind(Number(executorId)).run();
}
export async function getProfile(env,executorId){
  return env.DB.prepare(`SELECT executor_id,situation,situation_note,current_location,location_updated_at,situation_updated_at,updated_at FROM executor_operational_profiles WHERE executor_id=? LIMIT 1`).bind(Number(executorId)).first();
}
export async function updateProfile(env,executorId,{situation,currentLocation,situationNote}){
  await ensureProfile(env,executorId);
  const current=await getProfile(env,executorId);
  const nextSituation=situation===undefined?current?.situation||'Available':situation;
  const nextLocation=currentLocation===undefined?current?.current_location||null:currentLocation;
  const nextNote=situationNote===undefined?current?.situation_note||'':situationNote;
  await env.DB.prepare(`UPDATE executor_operational_profiles SET situation=?,situation_note=?,current_location=?,location_updated_at=CASE WHEN ? IS NOT NULL THEN CURRENT_TIMESTAMP ELSE location_updated_at END,situation_updated_at=CASE WHEN ?<>COALESCE(situation,'') THEN CURRENT_TIMESTAMP ELSE situation_updated_at END,updated_at=CURRENT_TIMESTAMP WHERE executor_id=?`)
    .bind(nextSituation,nextNote,nextLocation,currentLocation===undefined?null:nextLocation,nextSituation,Number(executorId)).run();
  return getProfile(env,executorId);
}
export async function listProfiles(env,executorIds=[]){
  const ids=[...new Set(executorIds.map(Number).filter(Boolean))]; if(!ids.length)return [];
  const q=ids.map(()=>'?').join(',');
  const r=await env.DB.prepare(`SELECT executor_id,situation,situation_note,current_location,location_updated_at,situation_updated_at,updated_at FROM executor_operational_profiles WHERE executor_id IN (${q})`).bind(...ids).all();
  return r.results||[];
}
