import {canonicalFirst,canonicalAll} from '../../core/canonical-db.js';
import {RELEASE_VERSION} from '../../core/release.js';
import {planAgentMission} from './agent-planner.service.js';
import {appendAgentDecision,authorizeAgentExecution} from './agentic-governance.service.js';
import {executeCanonicalAction} from '../../application/actions/canonical-action.application.service.js';
import {actionDefinition} from '../../application/actions/action-registry.js';
import {resolveExternalProviderCapability,dispatchExternalProviderOperation,EXTERNAL_PROVIDER_INTEGRATION_VERSION} from '../../security/external-provider-integration.service.js';
import {requirePilotExecutionScope} from './agent-customer-pilot.service.js';
import {appendAgentOutcomeEvent,appendOutcomeFromCanonicalExecution} from './agent-outcome-ledger.service.js';
import {appendProductionExecutionEvent,requireProductionMissionBoundary,AGENT_PRODUCTION_EXECUTION_VERSION} from './agent-production-execution.service.js';

import {requireCapabilityContract} from '../../security/capability-contract.service.js';
import {requireCapabilityOperation,CAPABILITY_RESOURCE_CONTRACT_VERSION} from '../../security/capability-resource-contract.service.js';
import {createExecutionIntent,transitionExecutionIntent,EXECUTION_INTENT_VERSION} from '../execution-engine/execution-intent.service.js';
import {captureExecutionRuntimeFence,assertExecutionRuntimeFence,EXECUTION_RUNTIME_HARDENING_VERSION} from '../execution-engine/execution-runtime-hardening.service.js';

export const AGENT_GOVERNED_EXECUTION_VERSION='12.1.0';
export const EXECUTION_ATTEMPT_STATES=Object.freeze(['PREPARED','AUTHORIZED','DISPATCHED','EXECUTING','SUCCEEDED','FAILED','UNKNOWN','VERIFYING','VERIFIED','RECOVERY_REQUIRED','RECOVERED']);

/**
 * 11.11 governed execution boundary.
 *
 * The agent may request execution, but this service never becomes a second
 * action authority. It re-plans against fresh canonical truth, records an
 * immutable execution attempt, delegates authorization to agent governance,
 * and finally delegates the actual mutation to canonical action application.
 */
export async function executeGovernedAgentMission(env,request,router,session,missionId,input={}){
  const mid=Number(missionId||0)||0;
  if(!mid)throw fail('AGENT_MISSION_ID_REQUIRED',400);
  const actionCode=String(input?.actionCode||'').trim();
  if(!actionCode)throw fail('AGENT_ACTION_CODE_REQUIRED',400);
  let decisionId=String(input?.decisionId||'').trim().slice(0,120);
  const suppliedContextHash=String(input?.contextHash||'').trim().slice(0,128);
  if(!suppliedContextHash)throw fail('AGENT_CONTEXT_HASH_REQUIRED',400);

  const plan=await planAgentMission(env,request,session,mid,{goal:input?.goal,candidateLimit:Math.min(12,Math.max(1,Number(input?.candidateLimit)||8)),actionCode});
  const recommendation=plan.recommendedNextAction;
  if(String(plan.contextHash)!==suppliedContextHash)throw fail('AGENT_CONTEXT_HASH_STALE',409);
  if(!recommendation||String(recommendation.actionCode)!==actionCode)throw fail('AGENT_ACTION_NOT_CURRENT_RECOMMENDATION',409);
  if(recommendation.state!=='READY')throw fail('AGENT_ACTION_NOT_READY',423);
  if(!['RECOMMEND','CONTROLLED_AUTONOMY_READY'].includes(plan.risk?.policyGate?.state))throw Object.assign(new Error('AGENT_POLICY_GATE_DEFERRED'),{status:423,code:'AGENT_POLICY_GATE_DEFERRED',reasons:plan.risk?.policyGate?.reasons||[]});
  if(recommendation.humanApprovalRequired)throw fail('AGENT_HUMAN_APPROVAL_REQUIRED',423);

  const definition=actionDefinition(actionCode);
  if(!definition)throw fail('ACTION_NOT_REGISTERED',404);
  const companyId=Number(session?.tenantId||0)||0;
  if(!companyId)throw fail('AGENT_COMPANY_ID_REQUIRED',403);
  const idempotencyKey=String(input?.idempotencyKey||request.headers.get('X-Idempotency-Key')||'').trim().slice(0,120)||crypto.randomUUID();
  const existing=await canonicalFirst(env,'SELECT * FROM agent_execution_attempts WHERE idempotency_key=? LIMIT 1',[idempotencyKey],'agent_execution_attempt_store');
  if(existing)return {version:AGENT_GOVERNED_EXECUTION_VERSION,attempt:normalizeAttempt(existing),idempotent:true,execution:null};
  const mission=await canonicalFirst(env,'SELECT id,company_id,state_version,status,updated_at,country_code,sector_code FROM missions WHERE id=? AND company_id=? LIMIT 1',[mid,companyId],'mission_authority');
  if(!mission)throw fail('MISSION_NOT_FOUND_OR_ACCESS_DENIED',404);
  const countryCode=String(mission.country_code||session?.countryCode||'ZZ').toUpperCase();
  const sectorCode=String(mission.sector_code||'general').toLowerCase();
  const providerCapability=await resolveExternalProviderCapability(env,{companyId,countryCode,sectorCode,actionCode});
  if(providerCapability&&Number(providerCapability.verification_required)!==1)throw fail('EXTERNAL_PROVIDER_VERIFICATION_REQUIRED',503);
  // Preserve the canonical capability authority check while the 13.2 gateway adds resource-consumer enforcement.
  await requireCapabilityContract(env,'execution',{riskClass:'critical',requiredCommand:'execute_action'});
  if(providerCapability)await requireCapabilityContract(env,'provider_integration',{riskClass:'critical',requiredCommand:'dispatch_provider'});
  const executionContract=await requireCapabilityOperation(env,{capabilityCode:'execution',command:'execute_action',riskClass:'critical',tenantScope:'tenant'});
  const providerContract=providerCapability?await requireCapabilityOperation(env,{capabilityCode:'provider_integration',command:'dispatch_provider',riskClass:'critical',tenantScope:'tenant',resources:[{resourceType:'provider',resourceKey:String(providerCapability.code||providerCapability.provider_code||'')}]}):null;
  const stateToken=String(plan.stateToken||'').trim();
  if(!stateToken)throw fail('AGENT_STATE_TOKEN_REQUIRED',409);

  if(!decisionId){
    decisionId=crypto.randomUUID();
    await appendAgentDecision(env,{decisionId,companyId,missionId:mid,executorId:Number(session?.executorId||0)||null,actorType:'agent',agentId:'on-mission-agent',actionCode,intent:plan.intent,contextVersion:'1.0',contextHash:suppliedContextHash,plan,candidates:plan.candidates,alignment:plan.alignment,confidence:plan.confidence?.level,policyVersion:plan.risk?.policyGate?.policyVersion||undefined,metadata:{source:'governed_execution'},countryCode,sectorCode});
  }
  const decision=await authorizeAgentExecution(env,{decisionId,companyId,missionId:mid,actionCode,countryCode,sectorCode,providerAvailable:Boolean(providerCapability)});
  if(String(decision.decision.context_hash||'')!==suppliedContextHash)throw fail('AGENT_DECISION_CONTEXT_MISMATCH',409);
  if(Number(decision.decision.autonomy_level||0)<Number(decision.control.autonomyLevel||0)&&false)throw fail('AGENT_AUTONOMY_CONTEXT_INVALID',409);
  let pilotScope=null;
  let productionBoundary=null;
  if(decision.control.executionEnabled){
    pilotScope=await requirePilotExecutionScope(env,{companyId,missionId:mid,actionCode});
    productionBoundary=await requireProductionMissionBoundary(env,{companyId,missionId:mid,actionCode,productionMode:'PILOT_CONTROLLED'});
  }

  const runtimeFence=await captureExecutionRuntimeFence(env,{companyId,missionId:mid});
  const attemptId=crypto.randomUUID();
  const requestHash=await sha256(stableStringify({missionId:mid,actionCode,decisionId,contextHash:suppliedContextHash,stateToken,payload:input?.actionPayload||{},assignmentId:runtimeFence.assignmentId,assignmentVersion:runtimeFence.assignmentVersion}));
  await env.DB.prepare(`INSERT INTO agent_execution_attempts(attempt_id,idempotency_key,decision_id,company_id,mission_id,executor_id,action_code,action_version,actor_type,actor_id,authorization_json,request_hash,requested_effect_json,observed_effect_json,status,verification_status,context_hash,state_token_before,created_at,updated_at,metadata_json,policy_version,policy_hash,policy_scope,policy_snapshot_json,assignment_id,assignment_version,runtime_lease_id,runtime_lease_expires_at,last_heartbeat_at,retry_count) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?,?,?,?,?,?,?,?,?,0)`)
    .bind(attemptId,idempotencyKey,decisionId,companyId,mid,Number(session?.executorId||0)||null,actionCode,RELEASE_VERSION,'agent',String(session?.identityId||session?.executorId||'agent'),JSON.stringify({decision:'ALLOW',authority:'agentic_governance',riskClass:decision.decision.risk_class,autonomyLevel:decision.control.autonomyLevel,policyVersion:decision.control.policyVersion}),requestHash,JSON.stringify({actionCode,payload:input?.actionPayload||{}}),'{}','AUTHORIZED','PENDING',suppliedContextHash,stateToken,JSON.stringify({plannerVersion:plan.version,requestId:request.headers.get('X-Request-ID')||null,autonomyPolicy:decision.policy?.policy||null,pilotScope:pilotScope||null,runtimeFence,runtimeHardeningVersion:EXECUTION_RUNTIME_HARDENING_VERSION,capabilityContracts:{execution:executionContract,provider:providerContract,contractGatewayVersion:CAPABILITY_RESOURCE_CONTRACT_VERSION}}),decision.policy.policy.policyVersion,decision.policy.policy.policyHash,`${decision.policy.policy.scopeType}:${decision.policy.policy.scopeKey}`,JSON.stringify(decision.policy.policy),runtimeFence.assignmentId,runtimeFence.assignmentVersion,runtimeFence.leaseId,runtimeFence.leaseExpiresAt,new Date().toISOString()).run();
  const executionIntentId=crypto.randomUUID();
  const executionMode=providerCapability?'EXTERNAL':'INTERNAL';
  await createExecutionIntent(env,{intentId:executionIntentId,attemptId,companyId,missionId:mid,actionCode,actionVersion:RELEASE_VERSION,idempotencyKey,requestHash,stateTokenBefore:stateToken,requestedEffect:{actionCode,payload:input?.actionPayload||{}},executionMode,metadata:{plannerVersion:plan.version,decisionId,contextHash:suppliedContextHash,providerRequired:Boolean(providerCapability)}});
  await env.DB.prepare('UPDATE agent_execution_attempts SET execution_intent_id=?,metadata_json=? WHERE attempt_id=?').bind(executionIntentId,JSON.stringify({plannerVersion:plan.version,requestId:request.headers.get('X-Request-ID')||null,autonomyPolicy:decision.policy?.policy||null,pilotScope:pilotScope||null,executionMode,capabilityContracts:{execution:executionContract,provider:providerContract,contractGatewayVersion:CAPABILITY_RESOURCE_CONTRACT_VERSION}}),attemptId).run();
  await appendProductionExecutionEvent(env,{attemptId,decisionId,companyId,missionId:mid,actionCode,eventType:'BOUNDARY_ACCEPTED',productionMode:'PILOT_CONTROLLED',pilotId:pilotScope?.pilotId,countryCode,sectorCode,policyVersion:decision.policy.policy.policyVersion,policyHash:decision.policy.policy.policyHash,contextHash:suppliedContextHash,requestHash,evidence:{productionBoundary:productionBoundary?.ready===true,version:AGENT_PRODUCTION_EXECUTION_VERSION},metadata:{plannerVersion:plan.version}});
  await appendProductionExecutionEvent(env,{attemptId,decisionId,companyId,missionId:mid,actionCode,eventType:'STARTED',productionMode:'PILOT_CONTROLLED',pilotId:pilotScope?.pilotId,countryCode,sectorCode,policyVersion:decision.policy.policy.policyVersion,policyHash:decision.policy.policy.policyHash,contextHash:suppliedContextHash,requestHash,evidence:{stateToken},metadata:{plannerVersion:plan.version}});

  await updateAgentExecutionAttempt(env,attemptId,{status:'DISPATCHED',startedAt:new Date().toISOString()});
  if(!providerCapability)await updateAgentExecutionAttempt(env,attemptId,{status:'EXECUTING'});
  await transitionExecutionIntent(env,executionIntentId,{status:providerCapability?'READY_FOR_PROVIDER':'READY_FOR_CANONICAL_COMMIT',metadata:{phase:providerCapability?'provider':'canonical',intentVersion:EXECUTION_INTENT_VERSION}});
  let providerExecution=null;
  let result;
  try{
    if(providerCapability){
      await transitionExecutionIntent(env,executionIntentId,{status:'PROVIDER_DISPATCHED'});
      providerExecution=await dispatchExternalProviderOperation(env,{provider:providerCapability,companyId,missionId:mid,attemptId,executionIntentId,actionCode,idempotencyKey,payload:input?.actionPayload||{},countryCode,sectorCode,requestId:request.headers.get('X-Request-ID')||null});
      await updateAgentExecutionAttempt(env,attemptId,{status:'VERIFYING',verificationStatus:providerExecution.verified?'VERIFIED':'PENDING',providerCode:providerExecution.providerCode,providerOperationId:providerExecution.operationId,observedEffect:{provider:providerExecution.providerCode,operationId:providerExecution.operationId,verified:providerExecution.verified},metadata:{plannerVersion:plan.version,providerIntegrationVersion:EXTERNAL_PROVIDER_INTEGRATION_VERSION,executionIntentId}});
      if(!providerExecution.verified)throw Object.assign(new Error('EXTERNAL_PROVIDER_VERIFICATION_REQUIRED'),{status:502,code:'EXTERNAL_PROVIDER_VERIFICATION_REQUIRED'});
      await transitionExecutionIntent(env,executionIntentId,{status:'PROVIDER_VERIFIED',providerCode:providerExecution.providerCode,providerOperationId:providerExecution.operationId,verification:providerExecution.verification||{verified:true},metadata:{phase:'provider_verified',executionIntentId}});
    }
    await assertExecutionRuntimeFence(env,{companyId,missionId:mid,assignmentId:runtimeFence.assignmentId,assignmentVersion:runtimeFence.assignmentVersion,assigneeType:runtimeFence.assigneeType,assigneeId:runtimeFence.assigneeId,subjectKey:runtimeFence.subjectKey});
    result=await executeCanonicalAction(env,request,router,session,{missionId:mid,body:{...(input||{}),missionId:mid,actionCode,executionIntentId,agentDecisionId:decisionId,agentContextHash:suppliedContextHash,agentPlan:plan,agentIntent:plan.intent,agentContextVersion:'1.0',agentRecalibrationVersion:plan.confidence?.calibrationDeference||'11.09.0',providerExecution}});
  }catch(error){
    let outcomeEvent=null;
    let intentRecoveryWrite=null;
    try{
      outcomeEvent=await appendAgentOutcomeEvent(env,{decisionId,companyId,missionId:mid,executorId:Number(session?.executorId||0)||null,actorType:'agent',agentId:'on-mission-agent',actionCode,intent:plan.intent,contextVersion:'1.0',contextHash:suppliedContextHash,plan,authorization:decision.decision||{},executionStatus:'UNKNOWN',outcomeCode:'UNKNOWN',outcomeConfidence:'LOW',evidence:[{type:'execution_error',code:String(error?.code||error?.message||'EXECUTION_UNKNOWN').slice(0,160)}],stateVersionBefore:Number(mission.state_version||0)||null,stateVersionAfter:null,policyVersion:decision.policy.policy.policyVersion,recalibrationVersion:plan.confidence?.calibrationDeference||'11.09.0',metadata:{providerExecution:providerExecution||null,productionBoundary:true}});
    }catch(outcomeError){
      outcomeEvent={created:false,recordingFailed:true,errorCode:String(outcomeError?.code||outcomeError?.message||'AGENT_OUTCOME_RECORD_FAILED').slice(0,160)};
    }
    const productionEventType=providerExecution?.verified?'RECOVERY_REQUIRED':'UNKNOWN';
    try{
      intentRecoveryWrite=await transitionExecutionIntent(env,executionIntentId,{status:providerExecution?.verified?'RECOVERY_REQUIRED':'EXTERNAL_UNKNOWN',providerCode:providerExecution?.providerCode,providerOperationId:providerExecution?.operationId,recovery:{errorCode:String(error?.code||error?.message||'EXECUTION_UNKNOWN').slice(0,160),externalVerified:Boolean(providerExecution?.verified)},metadata:{phase:'execution_error',executionIntentId}});
    }catch(intentError){
      intentRecoveryWrite={failed:true,errorCode:String(intentError?.code||intentError?.message||'EXECUTION_INTENT_RECOVERY_WRITE_FAILED').slice(0,160)};
    }
    await appendProductionExecutionEvent(env,{attemptId,decisionId,companyId,missionId:mid,actionCode,eventType:productionEventType,productionMode:'PILOT_CONTROLLED',pilotId:pilotScope?.pilotId,countryCode,sectorCode,policyVersion:decision.policy.policy.policyVersion,policyHash:decision.policy.policy.policyHash,contextHash:suppliedContextHash,requestHash,outcomeEventId:outcomeEvent?.eventId,evidence:{errorCode:String(error?.code||error?.message||'EXECUTION_UNKNOWN').slice(0,160),providerVerified:Boolean(providerExecution?.verified)},metadata:{outcomeRecorded:Boolean(outcomeEvent)}});
    if(providerExecution?.verified){
      await updateAgentExecutionAttempt(env,attemptId,{status:'RECOVERY_REQUIRED',verificationStatus:'VERIFIED',failureCode:String(error?.code||error?.message||'CANONICAL_MUTATION_AFTER_PROVIDER_EFFECT_FAILED').slice(0,160),completedAt:new Date().toISOString(),recoveryState:'REASSESS',observedEffect:providerExecution,metadata:{uncertain:false,externalEffectVerified:true,canonicalMutationFailed:true,outcomeEventId:outcomeEvent?.eventId||null}});
      throw Object.assign(new Error('AGENT_EXECUTION_PARTIAL'),{status:502,code:'AGENT_EXECUTION_PARTIAL',attemptId});
    }
    await updateAgentExecutionAttempt(env,attemptId,{status:'UNKNOWN',verificationStatus:'UNKNOWN',failureCode:String(error?.code||error?.message||'EXECUTION_UNKNOWN').slice(0,160),completedAt:new Date().toISOString(),metadata:{uncertain:true,providerExecution:providerExecution||null,outcomeEventId:outcomeEvent?.eventId||null}});
    throw Object.assign(new Error('AGENT_EXECUTION_UNKNOWN'),{status:502,code:'AGENT_EXECUTION_UNKNOWN',attemptId});
  }

  const body=result?.body||{};
  const execution=body?.execution||{};
  const success=Boolean(result?.status>=200&&result?.status<300&&body?.success!==false&&execution?.executed!==false);
  const stale=Boolean(execution?.stale||body?.code==='MISSION_CHANGED');
  let after=null;
  let outcomeEvent=null;
  if(stale){
    await transitionExecutionIntent(env,executionIntentId,{status:providerExecution?.verified?'RECOVERY_REQUIRED':'FAILED',providerCode:providerExecution?.providerCode,providerOperationId:providerExecution?.operationId,canonicalResult:{stale:true},verification:{canonical:false,providerVerified:providerExecution?.verified??false},recovery:{required:Boolean(providerExecution?.verified),code:'STALE_STATE'},metadata:{phase:'canonical_effect_stale',executionIntentId}});
    after=await canonicalFirst(env,'SELECT state_version,updated_at,status FROM missions WHERE id=? LIMIT 1',[mid],'mission_authority');
    outcomeEvent=await recordCanonicalOutcome(env,{request,session,prepared:{actionCode},actionResult:{...execution,executed:false,success:false,stale:true},missionId:mid,decisionId,contextHash:suppliedContextHash,beforeMission:mission,afterMission:after,plan});
    await updateAgentExecutionAttempt(env,attemptId,providerExecution?.verified?{status:'RECOVERY_REQUIRED',verificationStatus:'VERIFIED',failureCode:'STALE_STATE_AFTER_PROVIDER_EFFECT',completedAt:new Date().toISOString(),recoveryState:'REASSESS',observedEffect:providerExecution,metadata:{stale:true,externalEffectVerified:true,outcomeEventId:outcomeEvent?.eventId||null}}:{status:'FAILED',verificationStatus:'UNKNOWN',failureCode:'STALE_STATE',completedAt:new Date().toISOString(),metadata:{stale:true,outcomeEventId:outcomeEvent?.eventId||null}});
    await appendProductionExecutionEvent(env,{attemptId,decisionId,companyId,missionId:mid,actionCode,eventType:providerExecution?.verified?'RECOVERY_REQUIRED':'FAILED',productionMode:'PILOT_CONTROLLED',pilotId:pilotScope?.pilotId,countryCode,sectorCode,policyVersion:decision.policy.policy.policyVersion,policyHash:decision.policy.policy.policyHash,contextHash:suppliedContextHash,requestHash,outcomeEventId:outcomeEvent?.eventId,evidence:{stale:true,providerVerified:Boolean(providerExecution?.verified)},metadata:{outcomeRecorded:Boolean(outcomeEvent)}});
  }else if(success){
    after=await canonicalFirst(env,'SELECT state_version,updated_at,status FROM missions WHERE id=? LIMIT 1',[mid],'mission_authority');
    const effectHash=await sha256(stableStringify(execution));
    // Persist the canonical effect evidence BEFORE promoting the intent to
    // CANONICAL_EFFECT_COMMITTED. The intent authority now fails closed if
    // effect evidence is missing, so this ordering is part of the truth fence.
    await updateAgentExecutionAttempt(env,attemptId,{status:'SUCCEEDED',verificationStatus:'PENDING',stateTokenAfter:after?.state_version!=null?`v:${after.state_version}`:null,completedAt:new Date().toISOString(),observedEffect:execution,effectHash,metadata:{canonicalResultStatus:result.status,verification:'pending',runtimeFence} });
    await transitionExecutionIntent(env,executionIntentId,{status:'CANONICAL_EFFECT_COMMITTED',providerCode:providerExecution?.providerCode,providerOperationId:providerExecution?.operationId,canonicalResult:execution,verification:{canonical:true,providerVerified:providerExecution?.verified??false},metadata:{phase:'canonical_effect_committed',executionIntentId,effectHash}});
    outcomeEvent=await recordCanonicalOutcome(env,{request,session,prepared:{actionCode},actionResult:{...execution,status:result.status},missionId:mid,decisionId,contextHash:suppliedContextHash,beforeMission:mission,afterMission:after,plan});
    if(outcomeEvent?.recordingFailed){
      await transitionExecutionIntent(env,executionIntentId,{status:'RECOVERY_REQUIRED',canonicalResult:execution,verification:{canonical:true,providerVerified:providerExecution?.verified??false},recovery:{required:true,code:'OUTCOME_EVIDENCE_UNAVAILABLE'},metadata:{phase:'outcome_evidence_unavailable',executionIntentId,effectHash}});
    }
    await appendProductionExecutionEvent(env,{attemptId,decisionId,companyId,missionId:mid,actionCode,eventType:'SUCCEEDED',productionMode:'PILOT_CONTROLLED',pilotId:pilotScope?.pilotId,countryCode,sectorCode,policyVersion:decision.policy.policy.policyVersion,policyHash:decision.policy.policy.policyHash,contextHash:suppliedContextHash,requestHash,outcomeEventId:outcomeEvent?.eventId,evidence:{canonicalResultStatus:result.status,executed:true},metadata:{outcomeRecorded:Boolean(outcomeEvent)}});
  }else{
    await transitionExecutionIntent(env,executionIntentId,{status:providerExecution?.verified?'RECOVERY_REQUIRED':'FAILED',providerCode:providerExecution?.providerCode,providerOperationId:providerExecution?.operationId,canonicalResult:execution,verification:{canonical:false,providerVerified:providerExecution?.verified??false},recovery:{required:Boolean(providerExecution?.verified),code:String(body?.code||body?.error||`HTTP_${result?.status||500}`).slice(0,160)},metadata:{phase:'canonical_effect_failed',executionIntentId}});
    after=await canonicalFirst(env,'SELECT state_version,updated_at,status FROM missions WHERE id=? LIMIT 1',[mid],'mission_authority');
    outcomeEvent=await recordCanonicalOutcome(env,{request,session,prepared:{actionCode},actionResult:{...execution,executed:false,success:false},missionId:mid,decisionId,contextHash:suppliedContextHash,beforeMission:mission,afterMission:after,plan});
    await updateAgentExecutionAttempt(env,attemptId,{status:'FAILED',verificationStatus:'UNKNOWN',failureCode:String(body?.code||body?.error||`HTTP_${result?.status||500}`).slice(0,160),completedAt:new Date().toISOString(),observedEffect:execution,metadata:{canonicalResultStatus:result?.status,outcomeEventId:outcomeEvent?.eventId||null}});
    await appendProductionExecutionEvent(env,{attemptId,decisionId,companyId,missionId:mid,actionCode,eventType:'FAILED',productionMode:'PILOT_CONTROLLED',pilotId:pilotScope?.pilotId,countryCode,sectorCode,policyVersion:decision.policy.policy.policyVersion,policyHash:decision.policy.policy.policyHash,contextHash:suppliedContextHash,requestHash,outcomeEventId:outcomeEvent?.eventId,evidence:{canonicalResultStatus:result?.status,executed:false},metadata:{outcomeRecorded:Boolean(outcomeEvent)}});
  }
  const saved=await canonicalFirst(env,'SELECT * FROM agent_execution_attempts WHERE attempt_id=? LIMIT 1',[attemptId],'agent_execution_attempt_store');
  return {version:AGENT_GOVERNED_EXECUTION_VERSION,productionVersion:AGENT_PRODUCTION_EXECUTION_VERSION,attempt:normalizeAttempt(saved),idempotent:false,execution:result,providerExecution,pilotScope,productionBoundary,outcomeEventId:outcomeEvent?.eventId||null};
}

export async function listAgentExecutionAttempts(env,{companyId=null,missionId=null,limit=50}={}){
  const n=Math.min(100,Math.max(1,Number(limit)||50));const where=[];const args=[];
  if(companyId){where.push('company_id=?');args.push(Number(companyId));}
  if(missionId){where.push('mission_id=?');args.push(Number(missionId));}
  return (await canonicalAll(env,`SELECT id,attempt_id,idempotency_key,decision_id,event_id,company_id,mission_id,executor_id,action_code,action_version,actor_type,actor_id,status,verification_status,failure_code,recovery_state,context_hash,state_token_before,state_token_after,started_at,completed_at,created_at,updated_at,metadata_json FROM agent_execution_attempts ${where.length?`WHERE ${where.join(' AND ')}`:''} ORDER BY id DESC LIMIT ?`,[...args,n],'agent_execution_attempt_store'))||[];
}

export async function updateAgentExecutionAttempt(env,attemptId,{status,verificationStatus,providerCode,providerOperationId,failureCode,completedAt,startedAt,stateTokenAfter,observedEffect,recoveryState,effectHash,metadata}={}){
  const sets=['status=?','updated_at=CURRENT_TIMESTAMP'];const args=[status];
  if(verificationStatus){sets.push('verification_status=?');args.push(verificationStatus);}
  if(providerCode!==undefined){sets.push('provider_code=?');args.push(providerCode||null);}
  if(providerOperationId!==undefined){sets.push('provider_operation_id=?');args.push(providerOperationId||null);}
  if(failureCode!==undefined){sets.push('failure_code=?');args.push(failureCode||null);}
  if(completedAt!==undefined){sets.push('completed_at=?');args.push(completedAt||null);}
  if(startedAt!==undefined){sets.push('started_at=?');args.push(startedAt||null);}
  if(stateTokenAfter!==undefined){sets.push('state_token_after=?');args.push(stateTokenAfter||null);}
  if(observedEffect!==undefined){sets.push('observed_effect_json=?');args.push(JSON.stringify(observedEffect||{}));}
  if(effectHash!==undefined){sets.push('effect_hash=?');args.push(effectHash||null);}
  if(recoveryState!==undefined){sets.push('recovery_state=?');args.push(recoveryState||null);}
  if(metadata!==undefined){sets.push('metadata_json=?');args.push(JSON.stringify(metadata||{}));}
  args.push(attemptId);await env.DB.prepare(`UPDATE agent_execution_attempts SET ${sets.join(',')} WHERE attempt_id=?`).bind(...args).run();
}
async function recordCanonicalOutcome(env,{request,session,prepared,actionResult,missionId,decisionId,contextHash,beforeMission,afterMission,plan}){
  try{
    return await appendOutcomeFromCanonicalExecution(env,{request,session,prepared,actionResult,missionId,decisionId,contextHash,beforeMission,afterMission,agentMeta:{agentId:'on-mission-agent',intent:plan.intent,contextVersion:'1.0',contextHash,plan,recalibrationVersion:plan.confidence?.calibrationDeference||'11.09.0'}});
  }catch(error){
    return {created:false,recordingFailed:true,errorCode:String(error?.code||error?.message||'AGENT_OUTCOME_RECORD_FAILED').slice(0,160)};
  }
}

function normalizeAttempt(row){if(!row)return null;return Object.freeze({...row,id:Number(row.id),companyId:Number(row.company_id),missionId:Number(row.mission_id),executorId:Number(row.executor_id||0)||null,authorization:json(row.authorization_json),requestedEffect:json(row.requested_effect_json),observedEffect:json(row.observed_effect_json),metadata:json(row.metadata_json),assignmentId:Number(row.assignment_id||0)||null,assignmentVersion:Number(row.assignment_version||0)||null,runtimeLeaseId:row.runtime_lease_id||null,runtimeLeaseExpiresAt:row.runtime_lease_expires_at||null,lastHeartbeatAt:row.last_heartbeat_at||null,effectHash:row.effect_hash||null,retryCount:Number(row.retry_count||0)});}
function json(v){try{return v?JSON.parse(v):{};}catch{return {};}}
function fail(code,status){return Object.assign(new Error(code),{status,code});}
function stableStringify(value){if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(stableStringify).join(',')}]`;return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;}
async function sha256(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
