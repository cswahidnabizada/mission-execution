import {canonicalFirst} from '../../core/canonical-db.js';
import {reconcileAgentExecutionAttempt,planAgentExecutionRecovery,AGENT_EXECUTION_RECOVERY_VERSION} from '../agentic-layer/agent-execution-recovery.service.js';
import {transitionExecutionIntent} from '../execution-engine/execution-intent.service.js';
import {reconcileProviderEffect,PROVIDER_EFFECT_RECONCILIATION_VERSION} from './provider-effect-reconciliation.service.js';
import {certifyMissionRuntimeRecovery,MISSION_RECOVERY_CERTIFICATION_VERSION} from './mission-recovery-certification.service.js';

export const MISSION_EXECUTION_RECOVERY_COORDINATOR_VERSION='13.1.0';
export const MISSION_EXECUTION_RECOVERY_EFFECT_FENCE_VERSION='14.2.0';
export const MISSION_EXECUTION_RECOVERY_COORDINATOR_RUNTIME_VERSION='15.1.0';

/**
 * Canonical verification/recovery conductor.
 *
 * This component coordinates Verification + Recovery but owns neither mission
 * truth nor execution truth. Existing authorities remain authoritative.
 * It refuses to convert an unresolved external effect into success.
 */
export async function convergeMissionExecutionRecovery(env,{attemptId,companyId=null,missionId=null,planRecovery=false}={}){
  const aid=String(attemptId||'').trim();
  if(!aid)throw fail('MISSION_RECOVERY_ATTEMPT_ID_REQUIRED',400);
  const attempt=await canonicalFirst(env,'SELECT * FROM agent_execution_attempts WHERE attempt_id=? LIMIT 1',[aid],'agent_execution_attempt_store');
  if(!attempt)throw fail('AGENT_EXECUTION_ATTEMPT_NOT_FOUND',404);
  const cid=Number(companyId||attempt.company_id||0)||0;
  const mid=Number(missionId||attempt.mission_id||0)||0;
  if(!cid||Number(attempt.company_id)!==cid)throw fail('AGENT_EXECUTION_ATTEMPT_ACCESS_DENIED',403);
  if(!mid||Number(attempt.mission_id)!==mid)throw fail('AGENT_EXECUTION_ATTEMPT_MISSION_MISMATCH',403);

  const intent=attempt.execution_intent_id
    ? await canonicalFirst(env,'SELECT * FROM mission_execution_intents WHERE intent_id=? LIMIT 1',[String(attempt.execution_intent_id)],'execution_intent_authority')
    : null;
  const external=String(intent?.execution_mode||'INTERNAL')!=='INTERNAL';
  const providerVerification=parse(intent?.verification_json);
  const providerVerified=providerVerification?.verified===true || providerVerification?.providerVerified===true;
  const providerEffect=await reconcileProviderEffect(env,{attemptId:aid,companyId:cid,missionId:mid});
  const reconciledProviderVerified=providerEffect.status==='AGREED_VERIFIED';

  const reconciliation=await reconcileAgentExecutionAttempt(env,{attemptId:aid,companyId:cid,missionId:mid});
  const verification=reconciliation.verification||null;
  const canonicalVerified=verification?.state==='VERIFIED';

  // External/hybrid execution requires BOTH external evidence and canonical evidence.
  // A canonical state match alone is insufficient evidence that the external world changed.
  if(external && !reconciledProviderVerified){
    const recovery=planRecovery?await planAgentExecutionRecovery(env,{attemptId:aid,companyId:cid,missionId:mid}):reconciliation;
    const recoveryCertification=await certifyMissionRuntimeRecovery(env,{attemptId:aid,companyId:cid,missionId:mid});
    if(intent) await transitionExecutionIntent(env,String(intent.intent_id),{
      status:'RECOVERY_REQUIRED',
      verification:{...(providerVerification||{}),canonicalVerified,providerVerified:false,providerEffectStatus:providerEffect.status,convergence:'UNRESOLVED_EXTERNAL_EFFECT'},
      recovery:{required:true,code:'EXTERNAL_EFFECT_VERIFICATION_REQUIRED',state:recovery.recovery?.state||'ESCALATE_HUMAN'},
      metadata:{phase:'verification_recovery_convergence',version:MISSION_EXECUTION_RECOVERY_COORDINATOR_VERSION}
    });
    return buildResult({attemptId:aid,missionId:mid,intent,verification,recovery:recovery.recovery||null,recoveryCertification,status:'RECOVERY_REQUIRED',external,providerVerified:reconciledProviderVerified,canonicalVerified,providerEffect});
  }

  if(canonicalVerified && (!external || reconciledProviderVerified)){
    if(intent && String(intent.status)!=='CANONICAL_EFFECT_COMMITTED'){
      await transitionExecutionIntent(env,String(intent.intent_id),{
        status:'CANONICAL_EFFECT_COMMITTED',
        verification:{...(providerVerification||{}),canonicalVerified:true,providerVerified:reconciledProviderVerified,providerEffectStatus:providerEffect.status},
        recovery:{required:false},
        metadata:{phase:'verified_effect_convergence',version:MISSION_EXECUTION_RECOVERY_COORDINATOR_VERSION}
      });
    }
    return buildResult({attemptId:aid,missionId:mid,intent,verification,recovery:null,recoveryCertification:null,status:'VERIFIED',external,providerVerified:reconciledProviderVerified,canonicalVerified,providerEffect});
  }

  const recovery=planRecovery?await planAgentExecutionRecovery(env,{attemptId:aid,companyId:cid,missionId:mid}):reconciliation;
  const recoveryCertification=await certifyMissionRuntimeRecovery(env,{attemptId:aid,companyId:cid,missionId:mid});
  if(intent) await transitionExecutionIntent(env,String(intent.intent_id),{
    status:'RECOVERY_REQUIRED',
    verification:{...(providerVerification||{}),canonicalVerified:false,providerVerified:reconciledProviderVerified,providerEffectStatus:providerEffect.status},
    recovery:{required:true,state:recovery.recovery?.state||'ESCALATE_HUMAN',strategy:recovery.recovery?.strategy||'REASSESS'},
    metadata:{phase:'verification_recovery_convergence',version:MISSION_EXECUTION_RECOVERY_COORDINATOR_VERSION}
  });
  return buildResult({attemptId:aid,missionId:mid,intent,verification,recovery:recovery.recovery||null,recoveryCertification,status:'RECOVERY_REQUIRED',external,providerVerified:reconciledProviderVerified,canonicalVerified,providerEffect});
}

function buildResult({attemptId,missionId,intent,verification,recovery,recoveryCertification,status,external,providerVerified,canonicalVerified,providerEffect}){
  return Object.freeze({version:MISSION_EXECUTION_RECOVERY_COORDINATOR_RUNTIME_VERSION,recoveryCoordinatorVersion:MISSION_EXECUTION_RECOVERY_COORDINATOR_VERSION,recoveryVersion:AGENT_EXECUTION_RECOVERY_VERSION,providerEffectReconciliationVersion:PROVIDER_EFFECT_RECONCILIATION_VERSION,recoveryCertificationVersion:MISSION_RECOVERY_CERTIFICATION_VERSION,attemptId,missionId,status,external,providerVerified,canonicalVerified,providerEffect,verification,recovery,recoveryCertification:intent?recoveryCertification:null,intent:intent?{intentId:intent.intent_id,status:intent.status,executionMode:intent.execution_mode,providerOperationId:intent.provider_operation_id||null}:null,unknownIsNotSuccess:status!=='VERIFIED'||(external?providerVerified:true)});
}
function parse(value){try{return JSON.parse(String(value||'{}'))}catch{return {}}}
function fail(code,status=409){return Object.assign(new Error(code),{code,status})}
