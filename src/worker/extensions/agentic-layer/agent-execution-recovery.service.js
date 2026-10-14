import {canonicalFirst,canonicalAll} from '../../core/canonical-db.js';
import {actionDefinition} from '../../application/actions/action-registry.js';
import {updateAgentExecutionAttempt} from './agent-governed-execution.service.js';
import {transitionExecutionIntent} from '../execution-engine/execution-intent.service.js';

export const AGENT_EXECUTION_RECOVERY_VERSION='11.12.0';
export const RECOVERY_STATES=Object.freeze(['NONE','VERIFY_CANONICAL_STATE','REASSESS','RETRY_CANDIDATE','ESCALATE_HUMAN','RECOVERED']);

/**
 * 11.12 execution verification/recovery boundary.
 *
 * Verification asks the canonical system what is true now. Recovery never
 * assumes an external effect occurred, never retries an UNKNOWN attempt,
 * and never becomes a second action authority. When canonical evidence is
 * insufficient, the attempt remains explicitly unresolved and is escalated.
 */
export async function reconcileAgentExecutionAttempt(env,{attemptId,companyId=null,missionId=null}={}){
  const aid=String(attemptId||'').trim();
  if(!aid)throw fail('AGENT_ATTEMPT_ID_REQUIRED',400);
  const attempt=await canonicalFirst(env,'SELECT * FROM agent_execution_attempts WHERE attempt_id=? LIMIT 1',[aid],'agent_execution_attempt_store');
  if(!attempt)throw fail('AGENT_EXECUTION_ATTEMPT_NOT_FOUND',404);
  if(companyId&&Number(attempt.company_id)!==Number(companyId))throw fail('AGENT_EXECUTION_ATTEMPT_ACCESS_DENIED',403);
  if(missionId&&Number(attempt.mission_id)!==Number(missionId))throw fail('AGENT_EXECUTION_ATTEMPT_MISSION_MISMATCH',403);
  if(['VERIFIED','RECOVERED'].includes(String(attempt.status)))return {version:AGENT_EXECUTION_RECOVERY_VERSION,attempt:normalize(attempt),idempotent:true,verification:parse(attempt.metadata_json)?.verification||null};

  const mission=await canonicalFirst(env,'SELECT id,company_id,status,state_version,updated_at FROM missions WHERE id=? AND company_id=? LIMIT 1',[Number(attempt.mission_id),Number(attempt.company_id)],'mission_authority');
  if(!mission)throw fail('MISSION_NOT_FOUND_OR_ACCESS_DENIED',404);
  const intent=attempt.execution_intent_id?await canonicalFirst(env,'SELECT * FROM mission_execution_intents WHERE intent_id=? LIMIT 1',[String(attempt.execution_intent_id)],'execution_intent_authority'):null;
  const external=String(intent?.execution_mode||'INTERNAL')!=='INTERNAL';
  const providerVerification=parse(intent?.verification_json);
  const providerVerified=providerVerification?.verified===true || providerVerification?.providerVerified===true;
  const verification=await verifyCanonicalEffect(env,attempt,mission,{external,providerVerified});
  if(verification.state==='VERIFIED'){
    await updateAgentExecutionAttempt(env,aid,{status:'VERIFIED',verificationStatus:'VERIFIED',failureCode:null,recoveryState:'RECOVERED',stateTokenAfter:mission.state_version!=null?`v:${mission.state_version}`:null,metadata:{verification,providerVerified,external}});
    if(intent && String(intent.status)!=='CANONICAL_EFFECT_COMMITTED') await transitionExecutionIntent(env,String(intent.intent_id),{status:'CANONICAL_EFFECT_COMMITTED',verification:{...providerVerification,providerVerified,canonicalVerified:true},recovery:{required:false},metadata:{phase:'recovery_verified_effect'}});
    await appendRecoveryEvent(env,{attempt,mission,eventType:'VERIFICATION_CONFIRMED',recoveryState:'RECOVERED',strategy:verification.strategy,evidence:{...verification,providerVerified,external}});
    return saved(env,aid,{verification,providerVerified,external});
  }

  const recovery=buildRecoveryDecision(attempt,verification);
  await updateAgentExecutionAttempt(env,aid,{status:'RECOVERY_REQUIRED',verificationStatus:verification.state==='UNKNOWN'?'UNKNOWN':'FAILED',recoveryState:recovery.state,metadata:{verification,recovery}});
  await appendRecoveryEvent(env,{attempt,mission,eventType:verification.state==='UNKNOWN'?'VERIFICATION_UNKNOWN':'VERIFICATION_FAILED',recoveryState:recovery.state,strategy:recovery.strategy,evidence:{verification,recovery}});
  await appendRecoveryEvent(env,{attempt,mission,eventType:'RECOVERY_REQUIRED',recoveryState:recovery.state,strategy:recovery.strategy,evidence:recovery});
  return saved(env,aid,{verification,recovery});
}

export async function planAgentExecutionRecovery(env,{attemptId,companyId=null,missionId=null}={}){
  const reconciled=await reconcileAgentExecutionAttempt(env,{attemptId,companyId,missionId});
  const attempt=reconciled.attempt;
  const recovery=reconciled.recovery||reconciled.verification?.recovery||null;
  if(!recovery)return reconciled;
  const raw=await canonicalFirst(env,'SELECT * FROM agent_execution_attempts WHERE attempt_id=? LIMIT 1',[String(attempt.attempt_id)],'agent_execution_attempt_store');
  const mission=await canonicalFirst(env,'SELECT id,company_id,status,state_version,updated_at FROM missions WHERE id=? AND company_id=? LIMIT 1',[Number(raw.mission_id),Number(raw.company_id)],'mission_authority');
  await appendRecoveryEvent(env,{attempt:raw,mission,eventType:'RECOVERY_PLANNED',recoveryState:recovery.state,strategy:recovery.strategy,evidence:recovery});
  return {...reconciled,recovery};
}

export async function reconcilePendingAgentExecutions(env,{limit=50,companyId=null}={}){
  const n=Math.min(100,Math.max(1,Number(limit)||50));
  const where=["status IN ('SUCCEEDED','FAILED','UNKNOWN','VERIFYING','RECOVERY_REQUIRED')","verification_status IN ('PENDING','FAILED','UNKNOWN')"];
  const args=[];
  if(companyId){where.push('company_id=?');args.push(Number(companyId));}
  const rows=(await canonicalAll(env,`SELECT attempt_id FROM agent_execution_attempts WHERE ${where.join(' AND ')} ORDER BY updated_at ASC,id ASC LIMIT ?`,[...args,n],'agent_execution_attempt_store'))||[];
  const results=[];for(const row of rows){try{results.push(await reconcileAgentExecutionAttempt(env,{attemptId:row.attempt_id,companyId}));}catch(error){results.push({attemptId:row.attempt_id,errorCode:error?.code||error?.message||'RECOVERY_RECONCILIATION_FAILED'});}}
  return {version:AGENT_EXECUTION_RECOVERY_VERSION,processed:results.length,results};
}

export async function listAgentExecutionRecoveryEvents(env,{companyId=null,missionId=null,attemptId=null,limit=50}={}){
  const n=Math.min(100,Math.max(1,Number(limit)||50));const where=[];const args=[];
  if(companyId){where.push('company_id=?');args.push(Number(companyId));}
  if(missionId){where.push('mission_id=?');args.push(Number(missionId));}
  if(attemptId){where.push('attempt_id=?');args.push(String(attemptId));}
  return (await canonicalAll(env,`SELECT * FROM agent_execution_recovery_events ${where.length?`WHERE ${where.join(' AND ')}`:''} ORDER BY id DESC LIMIT ?`,[...args,n],'agent_execution_recovery_event_store'))||[];
}

async function verifyCanonicalEffect(env,attempt,mission,{external=false,providerVerified=false}={}){
  if(external&&!providerVerified)return {state:'UNKNOWN',strategy:'EXTERNAL_EFFECT_VERIFICATION_REQUIRED',reason:'Provider verification evidence is not confirmed.'};
  const code=String(attempt.action_code||'');const def=actionDefinition(code);const requested=parse(attempt.requested_effect_json);const payload=requested?.payload||{};
  const transition=def?.quality?.stateTransition||null;
  if(transition){
    const current=String(mission.status||'');
    if(String(transition.to)===current)return {state:'VERIFIED',strategy:'CANONICAL_MISSION_STATUS',observedStatus:current,expectedStatus:transition.to};
    if((transition.from||[]).map(String).includes(current))return {state:'UNKNOWN',strategy:'CANONICAL_MISSION_STATUS',observedStatus:current,expectedStatus:transition.to,reason:'EXPECTED_TRANSITION_NOT_OBSERVED'};
    return {state:'UNKNOWN',strategy:'CANONICAL_MISSION_STATUS',observedStatus:current,expectedStatus:transition.to,reason:'CONFLICTING_MISSION_STATE'};
  }
  if(['assign_driver','change_driver'].includes(code)){
    const target=Number(payload.driverId||0)||null;
    const row=target?await canonicalFirst(env,`SELECT assignee_id,assignee_type,status FROM mission_assignments WHERE company_id=? AND mission_id=? AND assignee_type='driver' AND assignee_id=? AND status='active' ORDER BY id DESC LIMIT 1`,[Number(attempt.company_id),Number(attempt.mission_id),target],'mission_assignment_authority'):null;
    if(row)return {state:'VERIFIED',strategy:'CANONICAL_ASSIGNMENT_AUTHORITY',assignedDriverId:Number(row.assignee_id)};
    return {state:'UNKNOWN',strategy:'CANONICAL_ASSIGNMENT_AUTHORITY',expectedDriverId:target,reason:'EXPECTED_ASSIGNMENT_NOT_OBSERVED'};
  }
  if(code==='cancel_mission'){
    const current=String(mission.status||'');
    if(['Cancelled','Canceled'].includes(current))return {state:'VERIFIED',strategy:'CANONICAL_MISSION_STATUS',observedStatus:current};
    return {state:'UNKNOWN',strategy:'CANONICAL_MISSION_STATUS',observedStatus:current,expectedStatus:'Cancelled',reason:'CANCELLATION_NOT_OBSERVED'};
  }
  return {state:'UNKNOWN',strategy:'EXTERNAL_EFFECT_VERIFICATION_REQUIRED',reason:'NO_CANONICAL_VERIFIER_FOR_ACTION'};
}

function buildRecoveryDecision(attempt,verification){
  const code=String(attempt.action_code||'');
  if(verification.strategy==='EXTERNAL_EFFECT_VERIFICATION_REQUIRED')return {state:'ESCALATE_HUMAN',strategy:'EXTERNAL_EFFECT_VERIFICATION_REQUIRED',automaticRetry:false,reason:'External effect cannot be inferred from current canonical state.'};
  if(['UNKNOWN','FAILED'].includes(String(attempt.status||'')))return {state:'REASSESS',strategy:'REASSESS_CANONICAL_STATE',automaticRetry:false,reason:'Execution outcome is not sufficient evidence for a safe replay.'};
  if(code&&verification.reason==='EXPECTED_TRANSITION_NOT_OBSERVED')return {state:'RETRY_CANDIDATE',strategy:'REPLAN_AND_REAUTHORIZE',automaticRetry:false,reason:'Canonical state remains at the action precondition; a fresh planner decision may be required.'};
  return {state:'ESCALATE_HUMAN',strategy:'CONFLICT_REQUIRES_REVIEW',automaticRetry:false,reason:'Observed canonical state conflicts with the expected effect.'};
}

async function appendRecoveryEvent(env,{attempt,mission,eventType,recoveryState,strategy,evidence={}}){
  const eventId=crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO agent_execution_recovery_events(recovery_event_id,attempt_id,company_id,mission_id,event_type,recovery_state,strategy,evidence_json) VALUES(?,?,?,?,?,?,?,?)`).bind(eventId,String(attempt.attempt_id),Number(attempt.company_id),Number(attempt.mission_id),eventType,recoveryState,strategy,JSON.stringify(evidence||{})).run();
  return eventId;
}
async function saved(env,attemptId,extra={}){const row=await canonicalFirst(env,'SELECT * FROM agent_execution_attempts WHERE attempt_id=? LIMIT 1',[attemptId],'agent_execution_attempt_store');return {version:AGENT_EXECUTION_RECOVERY_VERSION,attempt:normalize(row),...extra};}
function normalize(row){if(!row)return null;return {...row,id:Number(row.id),companyId:Number(row.company_id),missionId:Number(row.mission_id),executorId:Number(row.executor_id||0)||null,authorization:parse(row.authorization_json),requestedEffect:parse(row.requested_effect_json),observedEffect:parse(row.observed_effect_json),metadata:parse(row.metadata_json)};}
function parse(v){try{return v?JSON.parse(v):{};}catch{return {};}}
function fail(code,status){return Object.assign(new Error(code),{status,code});}
