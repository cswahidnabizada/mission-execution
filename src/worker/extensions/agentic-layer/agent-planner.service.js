import {buildAgentMissionContext,hashAgentContext} from './agentic-context.service.js';
import {getAgenticControl,classifyAgentActionRisk,requiredAgentAutonomy} from './agentic-governance.service.js';
import {decideCanonicalActions} from '../../application/actions/canonical-action-decision.service.js';
import {actionDefinition} from '../../application/actions/action-registry.js';
import {assessMissionReference} from './mission-reference.service.js';
import {assessSectorMissionContract,SECTOR_MISSION_CONTRACT_VERSION} from '../../security/sector-mission-contract.service.js';
import {evaluateControlledAutonomy,AGENT_CONTROLLED_AUTONOMY_VERSION} from './agent-autonomy.service.js';

export const AGENT_PLANNER_VERSION='11.10.0';
export const AGENT_PLAN_STAGES=Object.freeze(['SITUATION','INTENT','ALIGNMENT','SEMANTIC_MEMORY','CANDIDATE_ACTIONS','PLAN','RISK','CONFIDENCE','RECOMMENDED_NEXT_ACTION']);
const SCORE_BY_STATE=Object.freeze({READY:1,REQUIRES_INPUT:.72,WAITING:.48,BLOCKED:.24,STALE:.08,UNAUTHORIZED:.05,UNAVAILABLE:0});
const ADVISORY_WEIGHT=Object.freeze({TRUSTED:1,CAUTION:.82,DEFER:.58,INSUFFICIENT_DATA:.74});

export async function planAgentMission(env,request,session,missionId,input={}){
  const context=await buildAgentMissionContext(env,session,Number(missionId||0));
  const contextHash=await hashAgentContext(context);
  const candidateLimit=Math.min(12,Math.max(1,Number(input?.candidateLimit)||8));
  const decisions=await decideCanonicalActions(env,request,session,{missionId:Number(missionId||0),body:{...(input||{}),missionId:Number(missionId||0)},limit:candidateLimit});
  const governance=await getAgenticControl(env);
  let reference;
  try{reference=await assessMissionReference(env,{companyId:Number(session?.tenantId||0)||0,missionId:Number(missionId||0),scenarioCode:input?.referenceScenarioCode||null});}
  catch(error){reference={version:'11.14.0',kind:'mission_reference_assessment',matched:false,degraded:true,readiness:{state:'UNAVAILABLE',reasons:['REFERENCE_SCENARIO_AUTHORITY_UNAVAILABLE']},errorCode:String(error?.code||'REFERENCE_SCENARIO_UNAVAILABLE')};}
  let sectorContract;
  try{sectorContract=await assessSectorMissionContract(env,{countryCode:context.identity?.countryCode||'ZZ',sectorCode:context.identity?.sectorCode||'general',scenarioCode:input?.sectorScenarioCode||input?.referenceScenarioCode||null,requireExecutionBoundary:false});}
  catch(error){sectorContract={version:SECTOR_MISSION_CONTRACT_VERSION,matched:false,ready:false,failures:[String(error?.code||error?.message||'SECTOR_MISSION_CONTRACT_UNAVAILABLE')]};}
  const autonomy=await evaluateControlledAutonomy(env,{companyId:Number(context.identity?.companyId||0)||0,countryCode:context.identity?.countryCode||'ZZ',sectorCode:context.identity?.sectorCode||'general',actionCode:String(input?.actionCode||context.canonical?.flow?.next?.action?.code||'').trim()||String(decisions?.decisions?.[0]?.actionCode||'')});
  return composeAgentPlan({context,contextHash,decisions,governance,input,reference,sectorContract,autonomy});
}

export function composeAgentPlan({context,contextHash,decisions,governance,input={},reference=null,sectorContract=null,autonomy=null}={}){
  if(!context||context.kind!=='agent_mission_context')throw Object.assign(new Error('AGENT_PLANNER_CONTEXT_INVALID'),{status:500,code:'AGENT_PLANNER_CONTEXT_INVALID'});
  const mission=context.canonical?.mission||{};
  const flow=context.canonical?.flow||{};
  const terminal=Boolean(flow.terminal||mission.lifecycle?.terminal);
  const intent=deriveIntent(context,input);
  const currentAction=String(flow?.next?.action?.code||context.actions?.available?.[0]?.code||'').trim()||null;
  const calibrationByAction=new Map((context.calibration?.actions||[]).map(x=>[String(x.actionCode||x.action_code||''),x]));
  const learningByAction=new Map((context.learning?.actions||[]).map(x=>[String(x.actionCode||x.action_code||''),x]));
  const candidates=(decisions?.decisions||[]).map(d=>normalizeCandidate(d,{currentAction,calibrationByAction,learningByAction,governance,terminal}));
  const ranked=candidates.slice().sort(compareCandidates);
  const recommendation=selectRecommendation(ranked,terminal);
  const policy=evaluatePlannerPolicy({context,governance,terminal,recommendation,autonomy});
  const semantic=normalizeSemanticEvidence(context.semanticMemory);
  const confidence=planConfidence({recommendation,context,semantic,calibrationByAction});
  const steps=buildPlanSteps({terminal,recommendation,policy});
  if(reference?.readiness?.state==='BLOCKED') steps.push('RESOLVE_REFERENCE_REQUIREMENTS');
  if(sectorContract&&!sectorContract.ready) steps.push('RESOLVE_SECTOR_CONTRACT');
  if(reference?.readiness?.state==='READY'&&reference?.readiness?.nextStep?.actionCode&&recommendation?.actionCode===reference.readiness.nextStep.actionCode) steps.push('REFERENCE_MISSION_STEP');
  return Object.freeze({
    version:AGENT_PLANNER_VERSION,
    kind:'agent_mission_plan',
    missionId:Number(context.identity?.missionId||0)||null,
    companyId:Number(context.identity?.companyId||0)||null,
    contextHash,
    stateToken:context.canonical?.stateToken||null,
    stages:AGENT_PLAN_STAGES,
    situation:Object.freeze({
      lifecycle:mission.lifecycle||null,
      truthState:flow?.status||mission.lifecycle?.status||null,
      nextAuthoritativeAction:currentAction,
      waitingFor:flow?.next?.waitingFor||null,
      reasonCode:flow?.next?.reasonCode||null,
      terminal
    }),
    intent:Object.freeze(intent),
    alignment:Object.freeze({
      authoritativeAction:currentAction,
      canonicalState:flow?.readiness?.state||null,
      viewerCanExecute:Boolean(flow?.next?.viewerCanExecute),
      source:'canonical_mission_flow',
      readOnly:true
    }),
    semanticMemory:Object.freeze(semantic),
    referenceMission:Object.freeze(reference||{version:'11.14.0',matched:false}),
    sectorContract:Object.freeze(sectorContract||{version:SECTOR_MISSION_CONTRACT_VERSION,matched:false,ready:false}),
    candidates:Object.freeze(ranked.slice(0,12)),
    plan:Object.freeze({
      mode:policy.state==='CONTROLLED_AUTONOMY_READY'?'CONTROLLED_AUTONOMY_READY':'RECOMMENDATION_ONLY',
      steps:Object.freeze(steps),
      executionBoundary:'canonical_action_application_service',
      authorizationRequired:true,
      verificationRequired:true,
      noMutationPerformed:true,
      controlledAutonomyVersion:AGENT_CONTROLLED_AUTONOMY_VERSION
    }),
    risk:Object.freeze({
      recommendedAction:recommendation?.actionCode||null,
      class:recommendation?.riskClass||null,
      requiredAutonomy:recommendation?.requiredAutonomy??null,
      humanApprovalRequired:Boolean(recommendation?.humanApprovalRequired),
      executionEnabled:Boolean(governance?.executionEnabled),
      governanceMode:String(governance?.mode||'UNKNOWN'),
      policyGate:policy,
      autonomyPolicy:autonomy?.policy||null,
      autonomyControl:autonomy?.control||null
    }),
    confidence:Object.freeze(confidence),
    recommendedNextAction:recommendation?Object.freeze(recommendation):null,
    authority:Object.freeze({
      canonicalTruth:'authoritative',
      canonicalActionDecision:'authoritative',
      authorization:'authoritative_domain_service',
      agentPlanner:'derived_advisory_only',
      learnedSignals:'advisory_only',
      semanticMemory:'advisory_only'
    })
  });
}

function deriveIntent(context,input={}){
  const supplied=String(input?.goal||input?.intent?.goal||'').trim().slice(0,300);
  const current=context.canonical?.flow?.next?.action||context.actions?.available?.[0]||null;
  const status=context.canonical?.mission?.lifecycle?.status||context.canonical?.flow?.status||'UNKNOWN';
  const goal=supplied||(
    current?.label
      ? `Move mission execution forward through the current authoritative action: ${current.label}.`
      : `Determine the next safe operational step for the mission in ${status} state.`
  );
  return {goal,status,requestedAction:String(input?.actionCode||'').trim()||null,source:supplied?'operator_input':'canonical_mission_state',readOnly:true};
}

function normalizeCandidate(decision,{currentAction,calibrationByAction,learningByAction,governance,terminal}){
  const code=String(decision?.actionCode||'');
  const definition=actionDefinition(code)||{};
  const riskClass=classifyAgentActionRisk(definition);
  const requiredAutonomy=requiredAgentAutonomy(riskClass);
  const calibration=calibrationByAction.get(code)||null;
  const learning=learningByAction.get(code)||null;
  const deference=String(calibration?.deferenceState||'INSUFFICIENT_DATA');
  const advisoryWeight=ADVISORY_WEIGHT[deference]??ADVISORY_WEIGHT.INSUFFICIENT_DATA;
  const baseScore=terminal?0:(SCORE_BY_STATE[decision?.state]??0);
  const currentBonus=code&&code===String(currentAction||'')&&decision?.state==='READY'?0.12:0;
  const rawScore=Math.min(1,baseScore+currentBonus);
  const learnedWeight=['IMPROVING','STABLE'].includes(String(learning?.learningState||''))?Math.max(.75,Math.min(1.1,Number(learning?.learnedWeight||.75))):.75;
  const score=Number((rawScore*advisoryWeight*learnedWeight).toFixed(4));
  const humanApprovalRequired=['HIGH_IMPACT','IRREVERSIBLE'].includes(riskClass);
  const executionEligible=Boolean(!terminal&&decision?.state==='READY'&&governance?.executionEnabled&&governance?.mode==='CONTROLLED_EXECUTION'&&Number(governance?.autonomyLevel||0)>=requiredAutonomy&&!humanApprovalRequired);
  return Object.freeze({
    actionCode:code,label:String(definition.label||code),state:String(decision?.state||'UNAVAILABLE'),reason:String(decision?.reason||''),
    score,baseScore:rawScore,advisoryWeight,deferenceState:deference,learningState:String(learning?.learningState||'INSUFFICIENT_DATA'),learnedWeight,learningSampleCount:Number(learning?.knownCount||0),
    riskClass,requiredAutonomy,humanApprovalRequired,executionEligible:Boolean(executionEligible),
    canonicalReady:Boolean(decision?.ready),target:decision?.target||null,stateToken:decision?.stateToken||null,
    next:decision?.next||null,policyVersion:String(governance?.policyVersion||''),
    plannerExecutionSignal:executionEligible?'CANONICAL_EXECUTION_LATER':'NON_EXECUTING',
    authority:'canonical_action_decision'
  });
}

function selectRecommendation(ranked,terminal){
  if(terminal)return null;
  const ready=ranked.find(x=>x.state==='READY');
  const candidate=ready||ranked.find(x=>['REQUIRES_INPUT','WAITING','BLOCKED'].includes(x.state))||null;
  if(!candidate)return null;
  return Object.freeze({...candidate,recommendationState:candidate.state==='READY'?'RECOMMEND':'DEFER',humanApprovalRequired:Boolean(candidate.humanApprovalRequired)});
}

function evaluatePlannerPolicy({context,governance,terminal,recommendation,autonomy=null}){
  const failures=[];
  if(!context.constraints?.canonicalTruthOnly)failures.push('CANONICAL_TRUTH_REQUIRED');
  if(!context.constraints?.authorizationRequired)failures.push('AUTHORIZATION_REQUIRED');
  if(!context.constraints?.verificationRequired)failures.push('VERIFICATION_REQUIRED');
  if(terminal)failures.push('MISSION_TERMINAL');
  if(!recommendation)failures.push('NO_RECOMMENDATION');
  if(recommendation?.state==='READY'&&recommendation?.humanApprovalRequired)failures.push('HUMAN_APPROVAL_REQUIRED');
  const calibrationDefers=recommendation?.deferenceState==='DEFER';
  if(calibrationDefers&&!failures.includes('HUMAN_APPROVAL_REQUIRED'))failures.push('CALIBRATION_DEFER');
  const autonomousActionMatches=Boolean(autonomy?.policy?.actionCode&&String(autonomy.policy.actionCode)===String(recommendation?.actionCode||''));
  if(recommendation?.state==='READY'&&autonomousActionMatches&&!autonomy.allowed)failures.push(...(autonomy.failures||[]));
  const controlledReady=failures.length===0&&Boolean(autonomy?.allowed)&&autonomousActionMatches&&recommendation?.state==='READY';
  return Object.freeze({state:controlledReady?'CONTROLLED_AUTONOMY_READY':(failures.length?'DEFER':'RECOMMEND'),reasons:Object.freeze([...new Set(failures)]),executionAllowed:false,controlledExecutionEligible:controlledReady,nonExecuting:true,requiresCanonicalRevalidation:true,requiresHumanApproval:Boolean(recommendation?.humanApprovalRequired),calibrationDefer:calibrationDefers,autonomyAllowed:Boolean(autonomy?.allowed),autonomyPolicy:autonomy?.policy||null,policyVersion:String(autonomy?.policy?.policyVersion||governance?.policyVersion||'')});
}

function planConfidence({recommendation,context,semantic,calibrationByAction}){
  if(!recommendation)return {level:'LOW',score:0,reason:'No candidate is ready for recommendation.',source:'planner'};
  const actionCalibration=calibrationByAction.get(recommendation.actionCode)||null;
  const stateScore=SCORE_BY_STATE[recommendation.state]??0;
  const evidence=Math.min(1,(Number(semantic.count||0)*.08));
  const score=Math.min(1,Math.max(0,(stateScore*.7)+(Number(recommendation.advisoryWeight||.74)*.2)+(evidence*.1)));
  const level=score>=.8?'HIGH':score>=.58?'MEDIUM':'LOW';
  return {level,score:Number(score.toFixed(4)),reason:recommendation.state==='READY'?'Canonical readiness supports a recommendation; learned and semantic signals remain advisory.':'Canonical state does not support immediate execution.',calibrationDeference:String(actionCalibration?.deferenceState||'INSUFFICIENT_DATA'),semanticSupportCount:Number(semantic.count||0),source:'planner'};
}

function buildPlanSteps({terminal,recommendation,policy}){
  if(terminal)return ['OBSERVE','UNDERSTAND','VERIFY_TERMINAL_STATE'];
  if(!recommendation)return ['OBSERVE','UNDERSTAND','REASSESS_CANONICAL_STATE'];
  const steps=['OBSERVE','UNDERSTAND','ALIGN','PREPARE'];
  if(recommendation.state==='REQUIRES_INPUT')steps.push('COLLECT_REQUIRED_INPUT');
  else if(recommendation.state==='WAITING')steps.push('WAIT_FOR_CANONICAL_CONDITION');
  else if(recommendation.state==='BLOCKED')steps.push('RESOLVE_CANONICAL_BLOCKER');
  else if(recommendation.state==='READY')steps.push('AUTHORIZE');
  if(recommendation.state==='READY')steps.push(policy.requiresHumanApproval?'HUMAN_APPROVAL':'EXECUTE_VIA_CANONICAL_BOUNDARY','VERIFY','RECOVER_IF_NEEDED','OUTCOME','LEARN');
  return steps;
}

function normalizeSemanticEvidence(memory){
  const rows=Array.isArray(memory?.results)?memory.results:[];
  return {status:String(memory?.status||'UNAVAILABLE'),advisoryOnly:true,canonicalRevalidationRequired:true,count:rows.length,results:rows.slice(0,4).map(x=>({missionId:Number(x.missionId||x.mission_id||0)||null,sourceType:x.sourceType||x.source_type||null,score:x.score==null?null:Number(x.score)}))};
}

function compareCandidates(a,b){
  const readyRank=Number(b.canonicalReady)-Number(a.canonicalReady);
  if(readyRank)return readyRank;
  const score=Number(b.score)-Number(a.score);
  if(score)return score;
  const stateRank={READY:0,REQUIRES_INPUT:1,WAITING:2,BLOCKED:3,STALE:4,UNAUTHORIZED:5,UNAVAILABLE:6};
  return (stateRank[a.state]??9)-(stateRank[b.state]??9)||String(a.actionCode).localeCompare(String(b.actionCode));
}
