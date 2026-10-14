export async function claimIdempotency(env,{scopeKey,actionKey,key,ttlSeconds=900}){
  if(!key)return {claimed:true,resourceId:null};
  await cleanupExpired(env);
  try{
    await env.DB.prepare(`
      INSERT INTO request_idempotency(scope_key,action_key,idempotency_key,resource_id,expires_at)
      VALUES (?,?,?,NULL,datetime('now',? || ' seconds'))
    `).bind(scopeKey,actionKey,key,String(Number(ttlSeconds))).run();
    return {claimed:true,resourceId:null};
  }catch(error){
    if(!/UNIQUE|constraint/i.test(String(error?.message||"")))throw error;
    const row=await env.DB.prepare(`
      SELECT resource_id,resource_reference FROM request_idempotency
      WHERE scope_key=? AND action_key=? AND idempotency_key=?
        AND datetime(expires_at)>datetime('now')
      LIMIT 1
    `).bind(scopeKey,actionKey,key).first();
    return {claimed:false,resourceId:row?.resource_id?Number(row.resource_id):null,resourceReference:row?.resource_reference?String(row.resource_reference):null};
  }
}


export async function bindIdempotencyReference(env,{scopeKey,actionKey,key,resourceReference}={}){
  if(!key||!resourceReference)return;
  await env.DB.prepare(`
    UPDATE request_idempotency SET resource_reference=?
    WHERE scope_key=? AND action_key=? AND idempotency_key=? AND resource_id IS NULL
  `).bind(String(resourceReference).slice(0,160),scopeKey,actionKey,key).run();
}

export async function finalizeIdempotency(env,{scopeKey,actionKey,key,resourceId}){
  if(!key)return;
  await env.DB.prepare(`
    UPDATE request_idempotency SET resource_id=?
    WHERE scope_key=? AND action_key=? AND idempotency_key=?
  `).bind(resourceId,scopeKey,actionKey,key).run();
}

export async function releaseIdempotency(env,{scopeKey,actionKey,key}){
  if(!key)return;
  try{await env.DB.prepare(`DELETE FROM request_idempotency WHERE scope_key=? AND action_key=? AND idempotency_key=? AND resource_id IS NULL`).bind(scopeKey,actionKey,key).run();}catch{}
}

async function cleanupExpired(env){
  try{await env.DB.prepare(`DELETE FROM request_idempotency WHERE datetime(expires_at)<=datetime('now')`).run();}catch(error){
    if(!/no such table:\s*request_idempotency/i.test(String(error?.message||"")))throw error;
  }
}
