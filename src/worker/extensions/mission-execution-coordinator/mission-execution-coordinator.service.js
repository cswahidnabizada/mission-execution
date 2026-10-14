import {canonicalFirst} from '../../core/canonical-db.js';
import {executeGovernedAgentMission} from '../agentic-layer/agent-governed-execution.service.js';
import {convergeMissionExecutionRecovery,MISSION_EXECUTION_RECOVERY_COORDINATOR_VERSION} from './mission-execution-recovery-coordinator.service.js';
import {buildMissionExecutionCoordinatorContract,validateMissionExecutionCoordinatorContract,MISSION_EXECUTION_COORDINATOR_VERSION} from './mission-execution-coordinator.contract.js';
import {requireCapabilityOperation,CAPABILITY_RESOURCE_CONTRACT_VERSION} from '../../security/capability-resource-contract.service.js';
import {assessSectorMissionContract,SECTOR_MISSION_CONTRACT_VERSION} from '../../security/sector-mission-contract.service.js';
import {assessMissionAssignment,MISSION_ASSIGNMENT_CAPABILITY_VERSION} from '../mission-assignment/mission-assignment.capability.js';
import {assessMissionOutcome,MISSION_OUTCOME_AUTHORITY_VERSION} from '../../security/mission-outcome-authority.service.js';
import {validateMissionCertificationRun,MISSION_CERTIFICATION_RUN_VERSION} from './mission-certification-run.service.js';
import {createMissionPlan,getMissionPlan,MISSION_PLANNING_AUTHORITY_VERSION} from '../mission-planning/mission-planning-authority.service.js';
import {evaluateMissionPlan,evaluationAllowsAcceptance,MISSION_PLAN_EVALUATION_AUTHORITY_VERSION} from '../mission-planning/mission-plan-evaluation-authority.service.js';
import {learnFromAgentOutcomes} from '../agentic-layer/agent-learning.service.js';
import {MISSION_CONTINUITY_AUTHORITY_VERSION} from '../../security/mission-continuity-authority.service.js';
import {decideCanonicalAction,CANONICAL_ACTION_DECISION_VERSION} from '../../application/actions/canonical-action-decision.service.js';

/**
 * Application-level execution conductor.
 *
 * This component does not own mission truth, authorization, provider truth,
 * execution attempts or recovery truth. It sequences existing capabilities
 * and returns one unified execution outcome. Domain authorities remain the
 * owners of their respective truths.
 */
export async function executeMission(env,request,router,session,missionId,input={}){
  const mid=Number(missionId||0)||0;
  if(!mid)throw fail('MISSION_EXECUTION_MISSION_ID_REQUIRED',400);
  const companyId=Number(session?.tenantId||0)||0;
  if(!companyId)throw fail('MISSION_EXECUTION_COMPANY_ID_REQUIRED',403);

  const mission=await canonicalFirst(env,'SELECT id,company_id,status,state_version,updated_at,country_code,sector_code,lifecycle_definition_id FROM missions WHERE id=? AND company_id=? LIMIT 1',[mid,companyId],'mission_authority');
  if(!mission)throw fail('MISSION_NOT_FOUND_OR_ACCESS_DENIED',404);

  const started=new Date().toISOString();
  let certificationRun=null;
  const phases=[];
  const phase=(name,capability,status,errorCode=null,startedAt=started)=>phases.push({phase:name,capability,status,startedAt,completedAt:new Date().toISOString(),errorCode});

  // The coordinator sequences capabilities; it does not re-implement them.
  phase('OBSERVE','mission_truth','COMPLETED');
  phase('UNDERSTAND','situation_intelligence','DELEGATED');
  const planningContract=await requireCapabilityOperation(env,{capabilityCode:'planning',command:'create_plan',riskClass:'high',tenantScope:'tenant',resources:[{resourceType:'configuration',resourceKey:'*'}]});
  let missionPlan=null;
  const requestedPlanId=Number(input?.planId||0)||0;
  if(requestedPlanId){
    missionPlan={version:MISSION_PLANNING_AUTHORITY_VERSION,plan:await getMissionPlan(env,{companyId,missionId:mid,planId:requestedPlanId})};
    if(!missionPlan.plan)throw fail('MISSION_PLAN_NOT_FOUND',404);
    phase('PLAN','planning','COMPLETED');
  }else{
    try{missionPlan=await createMissionPlan(env,{request,session,companyId,missionId:mid,input:input||{}});phase('PLAN','planning','COMPLETED');}
    catch(error){phase('PLAN','planning','BLOCKED',String(error?.code||error?.message||'MISSION_PLANNING_FAILED').slice(0,160));throw error;}
  }
  let evaluation=null;
  try{
    const evaluated=await evaluateMissionPlan(env,{request,session,companyId,missionId:mid,planId:missionPlan.plan?.id});
    evaluation=evaluated.evaluation;
    phase('EVALUATE','plan_evaluation',evaluation?.status==='ACCEPTABLE'?'COMPLETED':evaluation?.status||'BLOCKED');
  }catch(error){phase('EVALUATE','plan_evaluation','BLOCKED',String(error?.code||error?.message||'MISSION_PLAN_EVALUATION_FAILED').slice(0,160));throw error;}
  if(!evaluationAllowsAcceptance(evaluation))throw fail('MISSION_PLAN_REQUIRES_ACCEPTANCE',409,{plan:missionPlan.plan,evaluation,evaluationVersion:MISSION_PLAN_EVALUATION_AUTHORITY_VERSION});
  if(String(missionPlan.plan?.status||'')!=='ACCEPTED')throw fail('MISSION_PLAN_NOT_ACCEPTED',409,{planId:missionPlan.plan?.id,evaluation});
  phase('ACCEPT','planning','COMPLETED');
  const plannedActionCode=String(missionPlan.plan?.plan?.recommendedAction?.actionCode||'').trim();
  if(!plannedActionCode)throw fail('MISSION_PLAN_ACTION_REQUIRED_FOR_AUTHORIZATION',409,{planId:missionPlan.plan?.id});
  if(String(input?.actionCode||'').trim()!==plannedActionCode)throw fail('MISSION_EXECUTION_ACTION_MISMATCH',409,{plannedActionCode,requestedActionCode:String(input?.actionCode||'').trim()});
  const actionDecision=await decideCanonicalAction(env,request,session,{missionId:mid,body:{...(input||{}),actionCode:plannedActionCode,missionId:mid}});
  if(actionDecision.state!=='READY' || actionDecision.authorization?.authorized!==true){
    throw fail('MISSION_ACTION_AUTHORIZATION_NOT_READY',actionDecision.state==='STALE'?409:403,{actionDecision,authorizationVersion:CANONICAL_ACTION_DECISION_VERSION});
  }
  phase('AUTHORIZE','authorization','COMPLETED');

  // Operationalize the sector contract before execution. The sector contract is a
  // reusable scenario projection; canonical mission/lifecycle/action authorities remain owners.
  const sectorContract=await assessSectorMissionContract(env,{countryCode:mission.country_code||'ZZ',sectorCode:mission.sector_code||'general',scenarioCode:input?.sectorScenarioCode||input?.referenceScenarioCode||null,requireExecutionBoundary:true});
  if(!sectorContract.ready)throw fail('SECTOR_MISSION_CONTRACT_NOT_READY',503,{failures:sectorContract.failures,sectorContractVersion:SECTOR_MISSION_CONTRACT_VERSION});
  const assignmentContract=await requireCapabilityOperation(env,{capabilityCode:'mission_assignment',command:'read_assignment',riskClass:'high',tenantScope:'tenant',resources:[{resourceType:'assignment_subject',resourceKey:'*'}]});

  // Operationalize capability/resource contracts before the execution capability is invoked.
  // This is a gate, not a new authority: the owning capabilities still own their truth.
  const executionContract=await requireCapabilityOperation(env,{capabilityCode:'execution',command:'execute_action',riskClass:'critical',tenantScope:'tenant'});
  const providerRequired=String(input?.executionMode||'').toUpperCase()==='EXTERNAL' || Boolean(input?.providerCode);
  const providerContract=providerRequired?await requireCapabilityOperation(env,{capabilityCode:'provider_integration',command:'dispatch_provider',riskClass:'critical',tenantScope:'tenant',resources:input?.providerCode?[{resourceType:'provider',resourceKey:String(input.providerCode)}]:[]}):null;
  const outcomeContract=await requireCapabilityOperation(env,{capabilityCode:'outcome',command:'assess_mission_outcome',riskClass:'medium',tenantScope:'tenant'});
  const continuityContract=await requireCapabilityOperation(env,{capabilityCode:'continuity',command:'record_next_situation',riskClass:'low',tenantScope:'tenant'});
  const contractEnvelope={version:CAPABILITY_RESOURCE_CONTRACT_VERSION,planning:{...planningContract,plan:missionPlan?.plan?.plan||null,planId:missionPlan?.plan?.id||null,planHash:missionPlan?.plan?.planHash||null,evaluationId:evaluation?.id||null,evaluationHash:evaluation?.evaluationHash||null,evaluationStatus:evaluation?.status||null,authorityVersion:MISSION_PLANNING_AUTHORITY_VERSION,evaluationAuthorityVersion:MISSION_PLAN_EVALUATION_AUTHORITY_VERSION,accepted:String(missionPlan.plan?.status||'')==='ACCEPTED'},assignment:assignmentContract,outcome:outcomeContract,continuity:continuityContract,sector:{version:SECTOR_MISSION_CONTRACT_VERSION,scenarioCode:sectorContract.contract.scenarioCode,sectorCode:sectorContract.contract.sectorCode,scenarioId:sectorContract.contract.id},execution:executionContract,provider:providerContract,missionAssignmentVersion:MISSION_ASSIGNMENT_CAPABILITY_VERSION};
  phase('PREPARE','resource_governance','COMPLETED');
  const assignmentAssessment=await assessMissionAssignment(env,{companyId,missionId:mid,reason:'execution_prepare',candidateLimit:10});
  phase('ASSIGN','mission_assignment',assignmentAssessment.currentAssignment?'COMPLETED':'BLOCKED');
  if(!assignmentAssessment.currentAssignment || ['REASSIGN','SHARE','ESCALATE'].includes(String(assignmentAssessment.decision?.decisionType))){
    throw fail('MISSION_ASSIGNMENT_REQUIRED_BEFORE_EXECUTION',409,{decision:assignmentAssessment.decision,candidates:assignmentAssessment.candidates,assignmentCapabilityVersion:MISSION_ASSIGNMENT_CAPABILITY_VERSION});
  }

  let execution;
  if(input?.certificationMode===true){
    certificationRun=await validateMissionCertificationRun(env,{token:input?.certificationRunToken,companyId,missionId:mid});
  }
  try {
    const executionInput=input?.certificationMode===true
      ? {...(input||{}),planId:Number(certificationRun.planId),actionCode:String(certificationRun.actionCode),contextHash:String(certificationRun.contextHash),idempotencyKey:`certification:${String(certificationRun.jti)}`}
      : (input||{});
    execution=await executeGovernedAgentMission(env,request,router,session,mid,executionInput);
  } catch(error) {
    phase('EXECUTE','execution','FAILED',String(error?.code||error?.message||'MISSION_EXECUTION_FAILED').slice(0,160));
    phase('EFFECT','effect','UNKNOWN','EXECUTION_EFFECT_UNRESOLVED');
    let recovery=null;
    const attemptId=String(error?.attemptId||'').trim();
    if(attemptId){
      try{recovery=await convergeMissionExecutionRecovery(env,{attemptId,companyId,missionId:mid,planRecovery:true});phase('VERIFY','verification',recovery?.status==='VERIFIED'?'COMPLETED':'UNRESOLVED');phase('RECOVER','recovery',recovery?.status==='VERIFIED'?'RECOVERED':'REQUIRED');}catch(recoveryError){recovery={status:'RECOVERY_REQUIRED',errorCode:String(recoveryError?.code||recoveryError?.message||'MISSION_RECOVERY_CONVERGENCE_FAILED').slice(0,160)};phase('VERIFY','verification','UNRESOLVED');phase('RECOVER','recovery','REQUIRED',recovery.errorCode);}
    }else{phase('VERIFY','verification','UNRESOLVED');phase('RECOVER','recovery','REQUIRED');}
    const contract=buildMissionExecutionCoordinatorContract({missionId:mid,status:mission.status,stateToken:stateToken(mission),executionMode:'GOVERNED',phases,outcome:{status:'RECOVERY_REQUIRED',verificationStatus:'UNKNOWN'},contractEnvelope,error:{code:error?.code||'MISSION_EXECUTION_FAILED',message:error?.message||'Mission execution failed'},recovery});
    const failures=validateMissionExecutionCoordinatorContract(contract);
    error.coordinator=contract;
    error.coordinatorFailures=failures;
    throw error;
  }

  phase('EXECUTE','execution','COMPLETED');
  const attempt=execution?.attempt||null;
  const attemptId=attempt?.attempt_id||attempt?.attemptId||null;
  let recovery=null;
  if(attemptId){
    try{recovery=await convergeMissionExecutionRecovery(env,{attemptId,companyId,missionId:mid,planRecovery:false});}catch(error){recovery={status:'RECOVERY_REQUIRED',errorCode:String(error?.code||error?.message||'MISSION_RECOVERY_CONVERGENCE_FAILED').slice(0,160)};}
  }
  const intentId=attempt?.execution_intent_id||attempt?.executionIntentId||null;
  const intent=intentId?await canonicalFirst(env,'SELECT intent_id,attempt_id,status,execution_mode,provider_code,provider_operation_id,verification_json,recovery_json FROM mission_execution_intents WHERE intent_id=? LIMIT 1',[intentId],'execution_intent_authority'):null;
  const effectCommitted=String(intent?.status||'')==='CANONICAL_EFFECT_COMMITTED';
  phase('EFFECT','effect',effectCommitted?'COMPLETED':'UNKNOWN',effectCommitted?null:'CANONICAL_EFFECT_UNCONFIRMED');

  const providerVerified=recovery?.providerVerified===true || execution?.providerExecution?.verified===true || Boolean(parseJson(intent?.verification_json)?.providerVerified);
  const canonicalVerified=recovery?.canonicalVerified===true || recovery?.status==='VERIFIED';
  const canonicalStatus=execution?.execution?.status||execution?.execution?.result?.status||null;

  phase('VERIFY','verification',canonicalVerified?'COMPLETED':'UNRESOLVED');

  const recoveryRequired=recovery?.status==='RECOVERY_REQUIRED' || String(intent?.status||'').includes('RECOVERY');
  if(recoveryRequired) phase('RECOVER','recovery','REQUIRED');
  else phase('RECOVER','recovery','NOT_REQUIRED');

  const outcomeStatus=canonicalVerified && String(intent?.status||'')==='CANONICAL_EFFECT_COMMITTED' && canonicalStatus ? 'SUCCEEDED' : recoveryRequired ? 'RECOVERY_REQUIRED' : 'FAILED';
  const verificationStatus=canonicalVerified?(providerVerified?'VERIFIED':'CANONICAL_ONLY'):'UNKNOWN';
  const outcome={status:outcomeStatus,verificationStatus,canonicalStatus,providerVerified,canonicalVerified,recovery};
  let missionOutcome=null;
  try{missionOutcome=await assessMissionOutcome(env,{companyId,missionId:mid,attemptId});}
  catch(outcomeError){missionOutcome={status:'UNAVAILABLE',errorCode:String(outcomeError?.code||outcomeError?.message||'MISSION_OUTCOME_ASSESSMENT_FAILED').slice(0,160)};}
  outcome.mission=missionOutcome?.assessment||missionOutcome;
  phase('OUTCOME','outcome',outcomeStatus==='SUCCEEDED'?'COMPLETED':outcomeStatus);
  let learning=null;
  try{learning=await learnFromAgentOutcomes(env,{companyId,limit:50});phase('LEARN','learning',learning?.status==='COMPLETED'?'COMPLETED':'DEFERRED');}catch(learningError){learning={status:'DEFERRED',errorCode:String(learningError?.code||learningError?.message||'LEARNING_DEFERRED').slice(0,160)};phase('LEARN','learning','DEFERRED',learning.errorCode);}

  phase('NEXT_SITUATION','continuity',missionOutcome?.assessment?.nextSituation?'COMPLETED':'DEFERRED');
  phase('NEXT_SITUATION','mission_truth',missionOutcome?.assessment?.nextSituation?.state==='NEXT_SITUATION_READY'?'READY':'DEFERRED');

  const refreshed=await canonicalFirst(env,'SELECT id,status,state_version,updated_at FROM missions WHERE id=? AND company_id=? LIMIT 1',[mid,companyId],'mission_authority');
  const contract=buildMissionExecutionCoordinatorContract({missionId:mid,status:refreshed?.status||mission.status,stateToken:stateToken(refreshed||mission),executionMode:intent?.execution_mode||'GOVERNED',phases,outcome,contractEnvelope,attempt,intent:intent?{intentId:intent.intent_id,attemptId:intent.attempt_id,status:intent.status,providerCode:intent.provider_code||null,providerOperationId:intent.provider_operation_id||null}:null});
  const failures=validateMissionExecutionCoordinatorContract(contract);
  if(failures.length)throw fail('MISSION_EXECUTION_COORDINATOR_CONTRACT_INVALID',500,{failures});

  return Object.freeze({version:MISSION_EXECUTION_COORDINATOR_VERSION,certificationRunVersion:MISSION_CERTIFICATION_RUN_VERSION,certificationRun,learning,planningAuthorityVersion:MISSION_PLANNING_AUTHORITY_VERSION,authorizationDecisionVersion:CANONICAL_ACTION_DECISION_VERSION,continuityAuthorityVersion:MISSION_CONTINUITY_AUTHORITY_VERSION,recoveryCoordinatorVersion:MISSION_EXECUTION_RECOVERY_COORDINATOR_VERSION,contractGatewayVersion:CAPABILITY_RESOURCE_CONTRACT_VERSION,outcomeAuthorityVersion:MISSION_OUTCOME_AUTHORITY_VERSION,coordinator:contract,execution,recovery,missionOutcome});
}

function stateToken(mission){return Number(mission?.state_version||0)>0?`v:${Number(mission.state_version)}`:String(mission?.updated_at||'');}
function parseJson(value){try{return JSON.parse(String(value||'{}'))}catch{return {};}}
function fail(code,status=409,extra={}){const error=Object.assign(new Error(code),{code,status});Object.assign(error,extra);return error;}
