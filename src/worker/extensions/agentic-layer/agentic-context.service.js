import {RELEASE_VERSION} from '../../core/release.js';
import {getForSession} from '../../modules/missions/missions.service.js';
import {resolveMissionAccess} from '../../security/mission-access.js';
import {listMissionExceptions} from '../../modules/attention/attention.service.js';
import {orchestrateMissionFlow} from '../mission-flow/mission-flow.orchestrator.js';
import {missionManagement} from '../mission-management/mission-management.service.js';
import {actionContractForMissionIntelligence} from '../actions-intelligence/actions-intelligence.service.js';
import {allActionDefinitions} from '../../application/actions/action-registry.js';
import {coordinateMissionEngines} from '../engine-coordinator/engine-coordinator.service.js';
import {resolveUserSituation} from '../../security/user-situation.service.js';
import {buildMissionContext} from '../../modules/intelligence/mission-context.js';
import {getAgenticControl,classifyAgentActionRisk,requiredAgentAutonomy} from './agentic-governance.service.js';
import {getAgentOutcomeMemory} from './agent-memory.service.js';
import {canonicalFirst} from '../../core/canonical-db.js';
import {getAgentMissionOutcomeHistory} from './mission-outcome-history.service.js';
import {searchAgentSemanticMemory,buildSemanticQueryFromAgentContext,semanticRuntimeStatus} from './agent-semantic-memory.service.js';
import {getAgentCalibrationSummary,AGENT_RECALIBRATION_VERSION} from './agent-recalibration.service.js';
import {resolveCompanyAutonomy} from './agent-autonomy.service.js';
import {getAgentLearningSummary,AGENT_LEARNING_VERSION} from './agent-learning.service.js';

export async function buildAgentMissionContext(env,session,missionId){
  const id=Number(missionId||0);
  if(!id)throw Object.assign(new Error('MISSION_ID_REQUIRED'),{status:400});
  const mission=await getForSession(env,session,id);
  if(!mission)throw Object.assign(new Error('Mission not found or access denied'),{status:404});
  const access=await resolveMissionAccess(env,session,id);
  if(!access)throw Object.assign(new Error('Mission access lost'),{status:403});
  const [exceptions,userSituation]=await Promise.all([
    listMissionExceptions(env,session,id),
    resolveUserSituation(env,session)
  ]);
  const flowResult=await orchestrateMissionFlow(env,session,mission,{exceptions});
  const featureState=flowResult.featureState||{};
  const management=await missionManagement(env,session,mission,{exceptions,flowBundle:flowResult});
  const networkInvitation=featureState.network?.pending?{id:featureState.network.id,status:featureState.network.status,relation:featureState.network.relation}:null;
  const forYouRequest=featureState.foryou?.pending?{id:featureState.foryou.id,status:'Pending',relation:featureState.foryou.relation}:null;
  const actions=actionContractForMissionIntelligence({
    conditions:flowResult.conditions,
    viewerDriverId:session.role==='driver'?Number(session.driverId||0):null,
    viewerExecutorId:session.role==='executor'?Number(session.executorId||0):null,
    openException:Boolean(featureState.exceptions?.open),
    openExceptionId:featureState.exceptions?.primaryExceptionId||null,
    canResolveException:Boolean(featureState.exceptions?.resolvable),
    networkInvitation,forYouRequest,featureState,
    missionUpdatedAt:mission.updated_at||null,
    stateToken:Number(mission.state_version||0)>0?`v:${Number(mission.state_version)}`:null,
    managementActions:management?.actions||[],
    readyToGo:Boolean(userSituation?.readyToGo),
    situation:userSituation
  });
  const truthResult=await coordinateMissionEngines(env,session,mission,{exceptions});
  const truth=truthResult?.coordination?.truth||truthResult?.finalOperationalProduct?.truth||null;
  if(!truth)throw Object.assign(new Error('Canonical mission truth unavailable'),{status:503});
  const canonicalContext=buildMissionContext(mission,{role:session.role,accessKind:String(access.accessKind||''),now:Date.now()});
  const availableActions=Array.isArray(actions?.all)?actions.all:[];
  const agenticGovernance=await getAgenticControl(env);
  const companyAutonomy=await resolveCompanyAutonomy(env,Number(mission.company_id||0)||0);
  const assignedExecutor=await canonicalFirst(env,`SELECT assignee_id AS executor_id FROM mission_active_assignment_projection WHERE company_id=? AND mission_id=? AND assignment_type='executor' AND assignee_type='executor' AND status='active' ORDER BY id DESC LIMIT 1`,[Number(mission.company_id||0),id],'canonical_assignment_authority');
  const executorId=Number(assignedExecutor?.executor_id||0)||null;
  const catalog=allActionDefinitions().map(a=>{
    const risk=classifyAgentActionRisk(a);const requiredAutonomy=requiredAgentAutonomy(risk);
    return {code:a.code,label:a.label,domain:a.domain||null,lifecycle:a.lifecycle||'ACTIVE',canonical:a.canonical!==false,
      confirmation:Boolean(a.confirmation),safeByDefault:Boolean(a.safeByDefault),surfaces:Array.isArray(a.surfaces)?a.surfaces:[],
      agentRiskClass:risk,agentExecutionEligible:Boolean(agenticGovernance.executionEnabled&&agenticGovernance.mode==='CONTROLLED_EXECUTION'&&agenticGovernance.autonomyLevel>=requiredAutonomy&&requiredAutonomy<5)};
  });
  const [memory,missionHistory,calibration,learning]=await Promise.all([
    getAgentOutcomeMemory(env,{companyId:Number(mission.company_id||0),executorId,actionCodes:catalog.map(a=>a.code)}),
    getAgentMissionOutcomeHistory(env,{companyId:Number(mission.company_id||0),missionId:id,limit:30}),
    getAgentCalibrationSummary(env,{companyId:Number(mission.company_id||0),actionCodes:catalog.map(a=>a.code)}),
    getAgentLearningSummary(env,{companyId:Number(mission.company_id||0),actionCodes:catalog.map(a=>a.code)})
  ]);
  const semanticStatus=semanticRuntimeStatus(env);
  const contextSeed={
    canonical:{mission:canonicalContext},
    situation:{conditions:flowResult.conditions||null,userSituation:{readyToGo:Boolean(userSituation?.readyToGo),readiness:userSituation?.classification?.readiness?.current||null}},
    missionHistory:{trajectory:missionHistory.trajectory.slice(-8),nextSituation:missionHistory.nextSituation}
  };
  let semanticMemory={version:semanticStatus.version,status:semanticStatus.enabled?'READY':'UNAVAILABLE',results:[],retrieval:semanticStatus};
  if(semanticStatus.enabled){
    try{
      const query=buildSemanticQueryFromAgentContext(contextSeed);
      const retrieval=await searchAgentSemanticMemory(env,{companyId:Number(mission.company_id||0),query,limit:4,accessCheck:async candidateMissionId=>Boolean(await getForSession(env,session,Number(candidateMissionId)))});
      semanticMemory={...retrieval,status:'READY'};
    }catch(e){semanticMemory={...semanticMemory,status:'DEGRADED',errorCode:e?.code||'AGENT_SEMANTIC_RETRIEVAL_FAILED'};}
  }
  const context={
    kind:'agent_mission_context',
    version:'1.0',
    release:RELEASE_VERSION,
    authoritativeSources:['mission','assignment','lifecycle','action_registry','authorization','evidence'],
    derivedOnly:true,
    identity:{missionId:id,reference:String(mission.reference||''),companyId:Number(mission.company_id||0)||null,countryCode:String(mission.country_code||'ZZ'),sectorCode:String(mission.sector_code||'general')},
    access:{kind:String(access.accessKind||''),role:String(session.role||''),tenantId:Number(session.tenantId||0)||null},
    canonical:{mission:canonicalContext,truth,flow:flowResult.contract||null,stateToken:Number(mission.state_version||0)>0?`v:${Number(mission.state_version)}`:null},
    situation:{conditions:flowResult.conditions||null,featureState:featureState||null,userSituation:{readyToGo:Boolean(userSituation?.readyToGo),readiness:userSituation?.classification?.readiness?.current||null}},
    actions:{available:availableActions,governedCatalog:catalog,count:catalog.length},
    management:{actions:Array.isArray(management?.actions)?management.actions:[]},
    governance:{mode:agenticGovernance.mode,autonomyLevel:agenticGovernance.autonomyLevel,executionEnabled:agenticGovernance.executionEnabled,policyVersion:agenticGovernance.policyVersion,companyMode:companyAutonomy.company.mode,companyAutonomyLevel:companyAutonomy.company.autonomyLevel,companyExecutionEnabled:companyAutonomy.company.executionEnabled,effectiveAutonomyLevel:companyAutonomy.autonomyLevel,effectiveExecutionEnabled:companyAutonomy.executionEnabled},
    memory:{version:memory.version,derivedOnly:true,organization:memory.organization,executor:memory.executor,actions:memory.actions,learningBoundary:memory.learningBoundary},
    calibration:{version:AGENT_RECALIBRATION_VERSION,derivedOnly:true,organization:calibration.organization,actions:calibration.actions,learningBoundary:calibration.learningBoundary},
    learning:{version:AGENT_LEARNING_VERSION,derivedOnly:true,actions:learning.actions,learningBoundary:learning.learningBoundary},
    missionHistory:{version:missionHistory.version,derivedOnly:true,trajectory:missionHistory.trajectory.slice(-20),timeline:missionHistory.timeline.slice(0,30),nextSituation:missionHistory.nextSituation,summary:missionHistory.summary,learningBoundary:missionHistory.learningBoundary},
    semanticMemory:{...semanticMemory,derivedOnly:true,advisoryOnly:true,canonicalRevalidationRequired:true,noAuthorizationInference:true},
    constraints:{canonicalTruthOnly:true,agentMayMutate:Boolean(companyAutonomy.executionEnabled&&companyAutonomy.autonomyLevel>=3),highImpactAutonomy:false,irreversibleAutonomy:false,authorizationRequired:true,verificationRequired:true},
    evidence:{missionExceptions:Array.isArray(exceptions)?exceptions.slice(0,20):[]}
  };
  return Object.freeze(context);
}

export async function hashAgentContext(context){
  return sha256(stableStringify(context));
}

function stableStringify(value){
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

async function sha256(value){
  const bytes=new TextEncoder().encode(String(value));
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
