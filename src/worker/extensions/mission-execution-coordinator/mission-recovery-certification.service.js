import {canonicalFirst,canonicalAll} from '../../core/canonical-db.js';
import {reconcileProviderEffect,PROVIDER_EFFECT_RECONCILIATION_VERSION} from './provider-effect-reconciliation.service.js';

export const MISSION_RECOVERY_CERTIFICATION_VERSION='15.1.0';

/**
 * Read-only runtime recovery certification surface.
 *
 * Recovery remains owned by the existing execution-recovery authority. This
 * service certifies whether a failed/unknown attempt may safely proceed to a
 * fresh reassessment boundary. It never retries, authorizes, dispatches,
 * commits effects, or changes mission truth.
 */
export async function certifyMissionRuntimeRecovery(env,{attemptId,companyId=null,missionId=null}={}){
  const aid=String(attemptId||'').trim();
  if(!aid)throw fail('MISSION_RECOVERY_CERTIFICATION_ATTEMPT_ID_REQUIRED',400);
  const attempt=await canonicalFirst(env,'SELECT * FROM agent_execution_attempts WHERE attempt_id=? LIMIT 1',[aid],'agent_execution_attempt_store');
  if(!attempt)throw fail('AGENT_EXECUTION_ATTEMPT_NOT_FOUND',404);
  const cid=Number(companyId||attempt.company_id||0)||0;
  const mid=Number(missionId||attempt.mission_id||0)||0;
  if(!cid||Number(attempt.company_id)!==cid)throw fail('AGENT_EXECUTION_ATTEMPT_ACCESS_DENIED',403);
  if(!mid||Number(attempt.mission_id)!==mid)throw fail('AGENT_EXECUTION_ATTEMPT_MISSION_MISMATCH',403);

  const mission=await canonicalFirst(env,'SELECT id,company_id,status,state_version,updated_at FROM missions WHERE id=? AND company_id=? LIMIT 1',[mid,cid],'mission_authority');
  if(!mission)throw fail('MISSION_NOT_FOUND_OR_ACCESS_DENIED',404);
  const intent=attempt.execution_intent_id?await canonicalFirst(env,'SELECT * FROM mission_execution_intents WHERE intent_id=? LIMIT 1',[String(attempt.execution_intent_id)],'execution_intent_authority'):null;
  const plan=await canonicalFirst(env,`SELECT id,plan_hash,state_token,status,context_hash,created_at,updated_at FROM mission_plans WHERE company_id=? AND mission_id=? ORDER BY id DESC LIMIT 1`,[cid,mid],'mission_planning_authority');
  const evaluation=plan?await canonicalFirst(env,`SELECT id,plan_id,plan_hash,state_token,status,evaluation_hash,expires_at,created_at FROM mission_plan_evaluations WHERE company_id=? AND mission_id=? AND plan_id=? ORDER BY id DESC LIMIT 1`,[cid,mid,Number(plan.id)],'mission_plan_evaluation_authority'):null;
  const assignment=attempt.assignment_id?await canonicalFirst(env,`SELECT id,assignment_id,assignment_version,status,assignee_type,assignee_id,executor_id,updated_at FROM mission_assignments WHERE company_id=? AND mission_id=? AND (assignment_id=? OR id=?) ORDER BY id DESC LIMIT 1`,[cid,mid,String(attempt.assignment_id),Number(attempt.assignment_id)||0],'mission_assignment_authority'):null;
  const providerEffect=await reconcileProviderEffect(env,{attemptId:aid,companyId:cid,missionId:mid});
  const events=await canonicalAll(env,`SELECT event_type,recovery_state,strategy,created_at FROM agent_execution_recovery_events WHERE company_id=? AND mission_id=? AND attempt_id=? ORDER BY id DESC LIMIT 20`,[cid,mid,aid],'agent_execution_recovery_event_store')||[];

  const status=String(attempt.status||'');
  const intentStatus=String(intent?.status||'');
  const recoveryRequired=['RECOVERY_REQUIRED','UNKNOWN','VERIFYING'].includes(status)||['RECOVERY_REQUIRED','EXTERNAL_UNKNOWN'].includes(intentStatus);
  const stateBefore=String(attempt.state_token_before||'');
  const currentToken=mission.state_version!=null?`v:${mission.state_version}`:'';
  const stateChanged=Boolean(stateBefore&&currentToken&&stateBefore!==currentToken);
  const leaseExpired=Boolean(attempt.runtime_lease_expires_at && new Date(String(attempt.runtime_lease_expires_at)).getTime()<=Date.now());
  const assignmentAligned=Boolean(assignment && String(assignment.status||'').toLowerCase()==='active' && Number(assignment.assignment_version||0)===Number(attempt.assignment_version||0) && String(assignment.assignee_id||'')===String(attempt.executor_id||assignment.executor_id||''));
  const planFresh=Boolean(plan && String(plan.status||'')==='ACCEPTED' && String(plan.state_token||'')===currentToken);
  const evaluationFresh=Boolean(evaluation && String(evaluation.status||'')==='ACCEPTABLE' && String(evaluation.plan_hash||'')===String(plan?.plan_hash||'') && String(evaluation.state_token||'')===currentToken && (!evaluation.expires_at || new Date(String(evaluation.expires_at)).getTime()>Date.now()));
  const authorization=parse(attempt.authorization_json);
  const explicitlyAuthorized=authorization?.authorized===true || String(authorization?.decision||'').toUpperCase()==='ALLOW';
  const recoveryEvent=events.find(e=>['RECOVERY_REQUIRED','RECOVERY_PLANNED'].includes(String(e.event_type||'')))||null;
  const automaticRetryForbidden=attempt.retry_count!=null && Number(attempt.retry_count)>=0;

  const blockers=[];
  if(!recoveryRequired)blockers.push('RECOVERY_NOT_REQUIRED');
  if(providerEffect.status==='AGREED_VERIFIED')blockers.push('EXTERNAL_EFFECT_ALREADY_VERIFIED');
  if(stateChanged)blockers.push('MISSION_STATE_CHANGED_REASSESS_REQUIRED');
  if(leaseExpired)blockers.push('EXECUTION_LEASE_EXPIRED');
  if(!assignmentAligned)blockers.push('ASSIGNMENT_REVALIDATION_REQUIRED');
  if(!planFresh)blockers.push('FRESH_ACCEPTED_PLAN_REQUIRED');
  if(!evaluationFresh)blockers.push('FRESH_ACCEPTABLE_PLAN_EVALUATION_REQUIRED');
  if(!explicitlyAuthorized)blockers.push('FRESH_AUTHORIZATION_REQUIRED');
  if(!automaticRetryForbidden)blockers.push('AUTOMATIC_RETRY_FORBIDDEN');
  if(['PROVIDER_CONFIRMATION_WITHOUT_CANONICAL_COMMIT','PROVIDER_CANONICAL_DISAGREEMENT','EFFECT_UNRESOLVED'].includes(String(providerEffect.status)))blockers.push('PROVIDER_EFFECT_RECONCILIATION_REQUIRED');

  const external=String(intent?.execution_mode||'INTERNAL')!=='INTERNAL';
  const providerUnknown=external && !['AGREED_VERIFIED','CANONICAL_EFFECT_WITHOUT_PROVIDER_CONFIRMATION'].includes(String(providerEffect.status));
  if(providerUnknown && !blockers.includes('PROVIDER_EFFECT_RECONCILIATION_REQUIRED'))blockers.push('PROVIDER_EFFECT_RECONCILIATION_REQUIRED');

  let decision='RECOVERY_REQUIRED';
  if(!recoveryRequired)decision='NOT_APPLICABLE';
  else if(providerEffect.status==='AGREED_VERIFIED')decision='RECOVERY_NOT_REQUIRED';
  else if(blockers.includes('MISSION_STATE_CHANGED_REASSESS_REQUIRED')||blockers.includes('EXECUTION_LEASE_EXPIRED')||blockers.includes('ASSIGNMENT_REVALIDATION_REQUIRED'))decision='REASSESS_REQUIRED';
  else if(blockers.includes('FRESH_ACCEPTED_PLAN_REQUIRED')||blockers.includes('FRESH_ACCEPTABLE_PLAN_EVALUATION_REQUIRED')||blockers.includes('FRESH_AUTHORIZATION_REQUIRED'))decision='REPLAN_REAUTHORIZE_REQUIRED';
  else if(blockers.includes('PROVIDER_EFFECT_RECONCILIATION_REQUIRED'))decision='PROVIDER_RECONCILIATION_REQUIRED';

  return Object.freeze({
    version:MISSION_RECOVERY_CERTIFICATION_VERSION,
    providerEffectReconciliationVersion:PROVIDER_EFFECT_RECONCILIATION_VERSION,
    attemptId:aid,companyId:cid,missionId:mid,decision,
    safeToRetry:false,automaticRetry:false,dispatchAllowed:false,
    recoveryRequired,stateChanged,leaseExpired,assignmentAligned,planFresh,evaluationFresh,
    authorizationPresent:explicitlyAuthorized,
    providerEffectStatus:providerEffect.status,
    blockers:[...new Set(blockers)],
    boundary:{
      unknownIsNotSuccess:true,
      unknownEffectRequiresReconciliation:true,
      changedStateRequiresReassessment:true,
      expiredLeaseRequiresFreshLease:true,
      changedAssignmentRequiresRevalidation:true,
      retryRequiresFreshPlan:true,
      retryRequiresFreshEvaluation:true,
      retryRequiresFreshAuthorization:true,
      recoveryNeverAutoRetries:true,
      recoveryDoesNotOwnMissionTruth:true,
      recoveryDoesNotDispatch:true,
      recoveryDoesNotCommitEffect:true
    },
    evidence:{attemptStatus:status,intentStatus,attemptStateToken:stateBefore,currentStateToken:currentToken,assignmentId:attempt.assignment_id||null,assignmentVersion:attempt.assignment_version||null,planId:plan?.id||null,evaluationId:evaluation?.id||null,recoveryEventType:recoveryEvent?.event_type||null}
  });
}
function parse(value){try{return JSON.parse(String(value||'{}'))}catch{return {}}}
function fail(code,status=409){return Object.assign(new Error(code),{code,status})}
