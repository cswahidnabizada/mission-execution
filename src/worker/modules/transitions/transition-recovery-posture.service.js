/**
 * ON Mission 10.88.0 — Canonical transition recovery posture.
 * Read-only composition over the durable transition ledger. It never mutates
 * transition state, grants authority, or performs reconciliation.
 */
const STALE_SECONDS=120;

export async function getMissionTransitionRecoveryPosture(env,{companyId,missionId}={}){
  const owner=Number(companyId||0),id=Number(missionId||0);
  if(!owner||!id)return Object.freeze({required:false,count:0,items:[],stale:false});
  const rows=await env.DB.prepare(`
    SELECT id,idempotency_key,action_code,mutation_phase,status,error_code,updated_at
    FROM mission_transition_requests
    WHERE company_id=? AND mission_id=? AND status='processing'
      AND (mutation_phase IN ('uncertain','event_committed')
        OR (mutation_phase='processing' AND datetime(updated_at)<=datetime('now',?)))
    ORDER BY id ASC LIMIT 10
  `).bind(owner,id,`-${STALE_SECONDS} seconds`).all();
  const items=(rows.results||[]).map(row=>Object.freeze({
    transitionKey:String(row.idempotency_key||''),
    actionCode:String(row.action_code||''),
    mutationPhase:String(row.mutation_phase||''),
    status:String(row.status||''),
    errorCode:row.error_code||null,
    updatedAt:row.updated_at||null
  }));
  return Object.freeze({
    required:items.length>0,
    count:items.length,
    stale:items.some(x=>x.mutationPhase==='processing'),
    items
  });
}
