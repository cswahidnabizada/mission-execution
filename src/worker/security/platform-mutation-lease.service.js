/* ON Mission 10.71.7 — shared non-domain mutation lease.
 * Concurrency metadata only. Canonical domain tables remain the sole truth.
 */
const DEFAULT_TTL_SECONDS=120;
const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
const conflict=(code,message,details={})=>Object.assign(new Error(message||code),{status:409,code,details});

export async function acquirePlatformMutationLease(env,{scopeKey,actorType='unknown',actorId=null,ttlSeconds=DEFAULT_TTL_SECONDS}={}){
  const scope=clean(scopeKey,500);
  if(!scope)throw new Error('MUTATION_SCOPE_REQUIRED');
  const token=crypto.randomUUID();
  const ttl=Math.min(600,Math.max(30,Number(ttlSeconds)||DEFAULT_TTL_SECONDS));
  const expiresExpr=`datetime('now','+${ttl} seconds')`;
  const inserted=await env.DB.prepare(`
    INSERT OR IGNORE INTO platform_mutation_leases(scope_key,lock_token,actor_type,actor_id,acquired_at,expires_at,updated_at)
    VALUES(?,?,?,?,CURRENT_TIMESTAMP,${expiresExpr},CURRENT_TIMESTAMP)
  `).bind(scope,token,clean(actorType,80),actorId==null?null:String(actorId)).run();
  if(Number(inserted?.meta?.changes||0)===1)return Object.freeze({scopeKey:scope,lockToken:token});
  const current=await env.DB.prepare(`SELECT lock_token,expires_at FROM platform_mutation_leases WHERE scope_key=? LIMIT 1`).bind(scope).first();
  if(current){
    const reclaimed=await env.DB.prepare(`
      UPDATE platform_mutation_leases
      SET lock_token=?,actor_type=?,actor_id=?,acquired_at=CURRENT_TIMESTAMP,expires_at=${expiresExpr},updated_at=CURRENT_TIMESTAMP
      WHERE scope_key=? AND lock_token=? AND expires_at<=CURRENT_TIMESTAMP
    `).bind(token,clean(actorType,80),actorId==null?null:String(actorId),scope,String(current.lock_token||'')).run();
    if(Number(reclaimed?.meta?.changes||0)===1)return Object.freeze({scopeKey:scope,lockToken:token,reclaimed:true});
  }
  throw conflict('MUTATION_ALREADY_PROCESSING','Another canonical mutation is already processing.',{scopeKey:scope});
}

export async function releasePlatformMutationLease(env,{scopeKey,lockToken}={}){
  if(!scopeKey||!lockToken)return;
  await env.DB.prepare(`DELETE FROM platform_mutation_leases WHERE scope_key=? AND lock_token=?`)
    .bind(clean(scopeKey,500),String(lockToken)).run();
}

export async function withPlatformMutationLease(env,options,fn){
  const lease=await acquirePlatformMutationLease(env,options);
  try{return await fn(lease);}finally{await releasePlatformMutationLease(env,lease);}
}
