import {canonicalFirst} from '../../core/canonical-db.js';

/**
 * 14.8 read-only provider/effect reconciliation surface.
 * It compares existing provider evidence with existing canonical execution/effect
 * truth. It does not dispatch, commit effects, authorize, or create recovery truth.
 */
export const PROVIDER_EFFECT_RECONCILIATION_VERSION='14.8.0';

export async function reconcileProviderEffect(env,{attemptId,companyId=null,missionId=null}={}){
  const aid=String(attemptId||'').trim();
  if(!aid)throw fail('PROVIDER_EFFECT_RECONCILIATION_ATTEMPT_REQUIRED',400);
  const attempt=await canonicalFirst(env,'SELECT * FROM agent_execution_attempts WHERE attempt_id=? LIMIT 1',[aid],'agent_execution_attempt_store');
  if(!attempt)throw fail('AGENT_EXECUTION_ATTEMPT_NOT_FOUND',404);
  const cid=Number(companyId||attempt.company_id||0)||0;
  const mid=Number(missionId||attempt.mission_id||0)||0;
  if(!cid||Number(attempt.company_id)!==cid)throw fail('AGENT_EXECUTION_ATTEMPT_ACCESS_DENIED',403);
  if(!mid||Number(attempt.mission_id)!==mid)throw fail('AGENT_EXECUTION_ATTEMPT_MISSION_MISMATCH',403);

  const intent=attempt.execution_intent_id?await canonicalFirst(env,'SELECT * FROM mission_execution_intents WHERE intent_id=? AND company_id=? AND mission_id=? LIMIT 1',[String(attempt.execution_intent_id),cid,mid],'execution_intent_authority'):null;
  const external=String(intent?.execution_mode||'INTERNAL')!=='INTERNAL';
  if(!external)return Object.freeze({version:PROVIDER_EFFECT_RECONCILIATION_VERSION,status:'NOT_APPLICABLE',external:false,canonicalEffect:canonicalEffect(intent),providerEvidence:null,disagreement:false});

  const providerCode=String(intent?.provider_code||attempt.provider_code||'').trim()||null;
  const operationId=String(intent?.provider_operation_id||attempt.provider_operation_id||'').trim()||null;
  const providerEvent=providerCode&&operationId
    ? await canonicalFirst(env,"SELECT * FROM external_provider_execution_events WHERE company_id=? AND mission_id=? AND attempt_id=? AND provider_code=? AND operation_id=? AND phase='VERIFY' ORDER BY id DESC LIMIT 1",[cid,mid,aid,providerCode,operationId],'external_provider_execution_events')
    : null;
  const canonical=canonicalEffect(intent);
  const provider=providerEffect(providerEvent);
  const status=classify(canonical,provider);
  return Object.freeze({version:PROVIDER_EFFECT_RECONCILIATION_VERSION,status,external:true,providerCode,operationId,canonicalEffect:canonical,providerEvidence:provider,disagreement:['PROVIDER_CANONICAL_DISAGREEMENT','CANONICAL_EFFECT_WITHOUT_PROVIDER_CONFIRMATION','PROVIDER_CONFIRMATION_WITHOUT_CANONICAL_COMMIT'].includes(status),safeToPromote:false,unknownIsNotSuccess:true});
}

function canonicalEffect(intent){
  const status=String(intent?.status||'');
  const verification=parse(intent?.verification_json);
  return {committed:status==='CANONICAL_EFFECT_COMMITTED',status,providerVerified:verification?.providerVerified===true,canonicalVerified:verification?.canonicalVerified===true};
}
function providerEffect(event){
  if(!event)return {present:false,status:'MISSING',verified:false,operationId:null};
  const status=String(event.status||'');
  const summary=parse(event.response_summary_json);
  return {present:true,status,verified:status==='VERIFIED',operationId:event.operation_id||null,responseSummary:summary,errorCode:event.error_code||null};
}
function classify(canonical,provider){
  if(canonical.committed&&provider.verified)return 'AGREED_VERIFIED';
  if(canonical.committed&&(!provider.present||!provider.verified))return 'CANONICAL_EFFECT_WITHOUT_PROVIDER_CONFIRMATION';
  if(provider.verified&&!canonical.committed)return 'PROVIDER_CONFIRMATION_WITHOUT_CANONICAL_COMMIT';
  if(provider.present&&['UNVERIFIED','UNKNOWN'].includes(provider.status))return 'PROVIDER_EFFECT_UNKNOWN';
  return 'EFFECT_UNRESOLVED';
}
function parse(v){try{return JSON.parse(String(v||'{}'))||{};}catch{return {};}}
function fail(code,status=409){return Object.assign(new Error(code),{code,status});}
