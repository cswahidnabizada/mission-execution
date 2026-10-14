/**
 * Canonical fenced mutation context.
 * A lease is valid only while the mission row carries the exact token acquired
 * for this transition request. Any worker whose lease was superseded is fenced
 * from continuing canonical work.
 */
export function createFencedMutationContext(env,{companyId,missionId,lockToken,transitionKey}={}){
  const owner=Number(companyId),id=Number(missionId),token=String(lockToken||''),key=String(transitionKey||'');
  if(!owner||!id||!token||!key)throw make('INVALID_MUTATION_FENCE',500);
  return Object.freeze({
    companyId:owner,missionId:id,lockToken:token,transitionKey:key,
    assert:()=>assertMutationLease(env,{companyId:owner,missionId:id,lockToken:token,transitionKey:key})
  });
}

export async function assertMutationLease(env,{companyId,missionId,lockToken,transitionKey=null}={}){
  const row=await env.DB.prepare(`
    SELECT id,state_version,state_lock_token,state_lock_at
    FROM mission_canonical_projection WHERE id=? AND company_id=? LIMIT 1
  `).bind(Number(missionId),Number(companyId)).first();
  if(!row || String(row.state_lock_token||'')!==String(lockToken||'')){
    const e=make('MUTATION_LEASE_LOST',409);
    e.details={missionId:Number(missionId),transitionKey:String(transitionKey||'')||null};
    throw e;
  }
  return Object.freeze({stateVersion:Number(row.state_version||0),stateToken:Number(row.state_version||0)>0?`v:${Number(row.state_version)}`:null});
}

export function leaseGuardedStatement(env,context,statementFactory){
  if(!context?.assert||typeof statementFactory!=='function')throw make('INVALID_MUTATION_FENCE',500);
  return Object.freeze({run:async()=>{await context.assert();const result=await statementFactory();await context.assert();return result;}});
}
function make(message,status){const e=new Error(message);e.status=status;return e;}
