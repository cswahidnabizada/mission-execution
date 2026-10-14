import {canonicalFirst,canonicalAll} from '../../core/canonical-db.js';
import {RELEASE_VERSION} from '../../core/release.js';

export const EXECUTION_INTENT_VERSION='12.9.0';
export const EXECUTION_EFFECT_INTEGRITY_VERSION='14.2.0';
export const EXECUTION_INTENT_STATES=Object.freeze([
  'INTENT_RECORDED','READY_FOR_PROVIDER','PROVIDER_DISPATCHED','PROVIDER_VERIFIED',
  'READY_FOR_CANONICAL_COMMIT','CANONICAL_EFFECT_COMMITTED','EXTERNAL_UNKNOWN',
  'RECOVERY_REQUIRED','RECOVERED','FAILED'
]);

export async function createExecutionIntent(env,{intentId=crypto.randomUUID(),attemptId,companyId,missionId,actionCode,actionVersion=RELEASE_VERSION,idempotencyKey,requestHash,stateTokenBefore,requestedEffect={},executionMode='INTERNAL',metadata={}}={}){
  if(!attemptId||!companyId||!missionId||!actionCode||!idempotencyKey||!requestHash)throw fail('EXECUTION_INTENT_REQUIRED',400);
  const existing=await canonicalFirst(env,'SELECT * FROM mission_execution_intents WHERE idempotency_key=? LIMIT 1',[String(idempotencyKey)],'execution_intent_authority');
  if(existing)return {intent:normalize(existing),idempotent:true};
  await env.DB.prepare(`INSERT INTO mission_execution_intents(intent_id,attempt_id,company_id,mission_id,action_code,action_version,idempotency_key,request_hash,state_token_before,requested_effect_json,execution_mode,status,provider_code,provider_operation_id,canonical_result_json,verification_json,recovery_json,created_at,updated_at,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?)`)
    .bind(String(intentId),String(attemptId),Number(companyId),Number(missionId),String(actionCode),String(actionVersion),String(idempotencyKey),String(requestHash),String(stateTokenBefore||''),JSON.stringify(requestedEffect||{}),String(executionMode), 'INTENT_RECORDED', null,null,'{}','{}','{}',JSON.stringify(metadata||{})).run();
  const row=await canonicalFirst(env,'SELECT * FROM mission_execution_intents WHERE intent_id=? LIMIT 1',[String(intentId)],'execution_intent_authority');
  return {intent:normalize(row),idempotent:false};
}

export async function transitionExecutionIntent(env,intentId,{status,providerCode,providerOperationId,canonicalResult,verification,recovery,metadata}={}){
  if(!EXECUTION_INTENT_STATES.includes(String(status)))throw fail('EXECUTION_INTENT_STATE_INVALID',409);
  const target=String(status);
  const current=await canonicalFirst(env,'SELECT * FROM mission_execution_intents WHERE intent_id=? LIMIT 1',[String(intentId)],'execution_intent_authority');
  if(!current)throw fail('EXECUTION_INTENT_NOT_FOUND',404);
  if(target==='CANONICAL_EFFECT_COMMITTED'){
    const attempt=await canonicalFirst(env,'SELECT attempt_id,company_id,mission_id,effect_hash,observed_effect_json,state_token_after,status FROM agent_execution_attempts WHERE attempt_id=? AND company_id=? AND mission_id=? LIMIT 1',[String(current.attempt_id),Number(current.company_id),Number(current.mission_id)],'agent_execution_attempt_store');
    if(!attempt)throw fail('CANONICAL_EFFECT_ATTEMPT_NOT_FOUND',409);
    let observed={};try{observed=JSON.parse(String(attempt.observed_effect_json||'{}'))||{};}catch{}
    if(!String(attempt.effect_hash||'').trim()||!observed||typeof observed!=='object'||Array.isArray(observed)||!Object.keys(observed).length)throw fail('CANONICAL_EFFECT_EVIDENCE_REQUIRED',409);
    const requestedVerification=verification&&typeof verification==='object'?verification:{};
    const external=String(current.execution_mode||'INTERNAL')!=='INTERNAL';
    if(external && requestedVerification.providerVerified!==true && requestedVerification.verified!==true)throw fail('CANONICAL_EFFECT_PROVIDER_EVIDENCE_REQUIRED',409);
    if(!String(attempt.state_token_after||'').trim())throw fail('CANONICAL_EFFECT_STATE_TOKEN_REQUIRED',409);
  }
  const sets=['status=?','updated_at=CURRENT_TIMESTAMP'];const args=[target];
  if(providerCode!==undefined){sets.push('provider_code=?');args.push(providerCode||null)}
  if(providerOperationId!==undefined){sets.push('provider_operation_id=?');args.push(providerOperationId||null)}
  if(canonicalResult!==undefined){sets.push('canonical_result_json=?');args.push(JSON.stringify(canonicalResult||{}))}
  if(verification!==undefined){sets.push('verification_json=?');args.push(JSON.stringify(verification||{}))}
  if(recovery!==undefined){sets.push('recovery_json=?');args.push(JSON.stringify(recovery||{}))}
  if(metadata!==undefined){sets.push('metadata_json=?');args.push(JSON.stringify(metadata||{}))}
  args.push(String(intentId));
  await env.DB.prepare(`UPDATE mission_execution_intents SET ${sets.join(',')} WHERE intent_id=?`).bind(...args).run();
  const row=await canonicalFirst(env,'SELECT * FROM mission_execution_intents WHERE intent_id=? LIMIT 1',[String(intentId)],'execution_intent_authority');
  if(!row)throw fail('EXECUTION_INTENT_NOT_FOUND',404);
  return normalize(row);
}

export async function getExecutionIntent(env,intentId){
  const row=await canonicalFirst(env,'SELECT * FROM mission_execution_intents WHERE intent_id=? LIMIT 1',[String(intentId||'')],'execution_intent_authority');
  return normalize(row);
}

export async function listExecutionIntents(env,{companyId=null,missionId=null,limit=50}={}){
  const n=Math.min(100,Math.max(1,Number(limit)||50));const where=[];const args=[];
  if(companyId){where.push('company_id=?');args.push(Number(companyId))}
  if(missionId){where.push('mission_id=?');args.push(Number(missionId))}
  const rows=await canonicalAll(env,`SELECT * FROM mission_execution_intents ${where.length?`WHERE ${where.join(' AND ')}`:''} ORDER BY id DESC LIMIT ?`,[...args,n],'execution_intent_authority');
  return rows.map(normalize);
}

function normalize(row){
  if(!row)return null;
  const parse=v=>{try{return JSON.parse(String(v??'{}'))}catch{return {}}};
  return {intentId:String(row.intent_id),attemptId:String(row.attempt_id),companyId:Number(row.company_id),missionId:Number(row.mission_id),actionCode:String(row.action_code),actionVersion:String(row.action_version||''),idempotencyKey:String(row.idempotency_key),requestHash:String(row.request_hash),stateTokenBefore:String(row.state_token_before||''),requestedEffect:parse(row.requested_effect_json),executionMode:String(row.execution_mode),status:String(row.status),providerCode:row.provider_code||null,providerOperationId:row.provider_operation_id||null,canonicalResult:parse(row.canonical_result_json),verification:parse(row.verification_json),recovery:parse(row.recovery_json),createdAt:row.created_at,updatedAt:row.updated_at,metadata:parse(row.metadata_json)};
}
function fail(code,status=409){return Object.assign(new Error(code),{code,status})}
