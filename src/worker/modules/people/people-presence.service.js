const PRESENCE_TTL_SECONDS=90;
const key=(tenantId,driverId)=>`presence:driver:${Number(tenantId)}:${Number(driverId)}`;

export async function touchDriverPresence(env,session){
  if(session?.role!=="driver"||!session.tenantId||!session.driverId)return false;
  await env.KV_BINDING.put(key(session.tenantId,session.driverId),new Date().toISOString(),{expirationTtl:PRESENCE_TTL_SECONDS});
  return true;
}

export async function isDriverPresent(env,tenantId,driverId){
  if(!tenantId||!driverId)return false;
  try{return Boolean(await env.KV_BINDING.get(key(tenantId,driverId)));}catch{return false;}
}

export async function annotateDriverPresence(env,drivers=[]){
  return Promise.all((drivers||[]).map(async driver=>({...driver,online:(Number(driver.active)===1&&await isDriverPresent(env,driver.company_id,driver.id))?1:0})));
}

export async function clearDriverPresence(env,tenantId,driverId){try{await env.KV_BINDING.delete(key(tenantId,driverId));}catch{}}
