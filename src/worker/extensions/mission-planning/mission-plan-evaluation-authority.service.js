import crypto from 'node:crypto';
import {canonicalFirst} from '../../core/canonical-db.js';
import {requireCapabilityOperation,requireResourceContract} from '../../security/capability-resource-contract.service.js';
import {assessSectorMissionContract} from '../../security/sector-mission-contract.service.js';
import {assessMissionAssignment} from '../mission-assignment/mission-assignment.capability.js';
import {decideCanonicalAction} from '../../application/actions/canonical-action-decision.service.js';
import {actionDefinition} from '../../application/actions/action-registry.js';
import {serviceDefinition} from '../../application/actions/action-service-map.js';
import {buildAgentMissionContext,hashAgentContext} from '../agentic-layer/agentic-context.service.js';
import {getAgenticControl} from '../agentic-layer/agentic-governance.service.js';

export const MISSION_PLAN_EVALUATION_AUTHORITY_VERSION='14.0.0';
export const MISSION_PLAN_EVALUATION_STATES=Object.freeze(['ACCEPTABLE','REQUIRES_REVIEW','BLOCKED','STALE','UNSAFE','INSUFFICIENT_EVIDENCE','UNKNOWN']);
const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
const parse=(v,f={})=>{try{return JSON.parse(String(v??''))??f}catch{return f}};
const stable=v=>JSON.stringify(v,(k,val)=>val&&typeof val==='object'&&!Array.isArray(val)?Object.keys(val).sort().reduce((o,key)=>(o[key]=val[key],o),{}):val);
const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const fail=(code,status=409,extra={})=>Object.assign(new Error(code),{code,status,...extra});

/** Canonical plan evaluation authority. It validates a plan for safety/readiness but never authorizes, assigns or executes. */
export async function evaluateMissionPlan(env,{request=null,session=null,companyId,missionId,planId}={}){
  const tenant=Number(companyId||session?.tenantId||0)||0,mid=Number(missionId||0)||0,pid=Number(planId||0)||0;
  if(!tenant||!mid||!pid)throw fail('MISSION_PLAN_EVALUATION_CONTEXT_REQUIRED',400);
  await requireCapabilityOperation(env,{capabilityCode:'planning',command:'evaluate_plan',riskClass:'high',tenantScope:'tenant',resources:[{resourceType:'configuration',resourceKey:'*'}]});
  const planRow=await canonicalFirst(env,'SELECT * FROM mission_plans WHERE id=? AND company_id=? AND mission_id=? LIMIT 1',[pid,tenant,mid],'mission_planning_authority');
  if(!planRow)throw fail('MISSION_PLAN_NOT_FOUND',404);
  const plan=normalizePlan(planRow);
  const findings=[]; const evidence={};
  const mission=await canonicalFirst(env,'SELECT id,company_id,status,state_version,updated_at,country_code,sector_code,objective,lifecycle_definition_id,capability_code FROM missions WHERE id=? AND company_id=? LIMIT 1',[mid,tenant],'mission_authority');
  if(!mission)throw fail('MISSION_NOT_FOUND_OR_ACCESS_DENIED',404);
  evidence.mission={stateVersion:Number(mission.state_version||0),status:mission.status,updatedAt:mission.updated_at};
  if(plan.expiresAt&&Date.parse(plan.expiresAt)<=Date.now())findings.push({code:'PLAN_EXPIRED',severity:'BLOCK'});
  const currentStateToken=Number(mission.state_version||0)>0?`v:${Number(mission.state_version)}`:String(mission.updated_at||'');
  evidence.stateToken={planned:plan.stateToken,current:currentStateToken};
  if(plan.stateToken!==currentStateToken)findings.push({code:'STALE_MISSION_TRUTH',severity:'STALE'});

  let freshContextHash=null;
  try{
    const context=await buildAgentMissionContext(env,session||{tenantId:tenant},mid);
    freshContextHash=await hashAgentContext(context);
    evidence.context={planned:plan.contextHash,current:freshContextHash};
    if(plan.contextHash!==freshContextHash)findings.push({code:'STALE_PLAN_CONTEXT',severity:'STALE'});
  }catch(error){findings.push({code:'CANONICAL_CONTEXT_UNAVAILABLE',severity:'BLOCK',detail:clean(error?.code||error?.message||'CONTEXT_UNAVAILABLE',160)});}

  const planBody=plan.plan||{};
  const recommendation=planBody.recommendedAction||null;
  const actionCode=clean(recommendation?.actionCode||'',120);
  evidence.action={actionCode,registered:Boolean(actionCode&&actionDefinition(actionCode)),routed:Boolean(actionCode&&serviceDefinition(actionCode))};
  if(!actionCode)findings.push({code:'NO_RECOMMENDED_ACTION',severity:'BLOCK'});
  else if(!actionDefinition(actionCode))findings.push({code:'ACTION_NOT_REGISTERED',severity:'BLOCK'});
  else if(!serviceDefinition(actionCode))findings.push({code:'ACTION_ROUTE_NOT_CONTRACTED',severity:'BLOCK'});

  let actionDecision=null;
  if(actionCode&&request&&session){
    try{
      actionDecision=await decideCanonicalAction(env,request,session,{missionId:mid,body:{actionCode,missionId:mid,...(planBody.input||{})}});
      evidence.actionDecision={state:actionDecision.state,ready:Boolean(actionDecision.ready),stateToken:actionDecision.stateToken||null,authorization:actionDecision.authorization||null};
      if(actionDecision.state==='STALE')findings.push({code:'ACTION_TRUTH_STALE',severity:'STALE'});
      else if(['UNAUTHORIZED','BLOCKED','UNAVAILABLE'].includes(actionDecision.state))findings.push({code:`ACTION_NOT_READY:${actionDecision.state}`,severity:'BLOCK'});
      else if(actionDecision.state==='REQUIRES_INPUT')findings.push({code:'ACTION_REQUIRES_INPUT',severity:'REVIEW'});
    }catch(error){findings.push({code:'ACTION_DECISION_UNAVAILABLE',severity:'BLOCK',detail:clean(error?.code||error?.message||'ACTION_DECISION_UNAVAILABLE',160)});}
  }else{
    findings.push({code:'ACTION_DECISION_CONTEXT_UNAVAILABLE',severity:'EVIDENCE'});
  }

  const sector=await assessSectorMissionContract(env,{countryCode:mission.country_code||'ZZ',sectorCode:mission.sector_code||'general',scenarioCode:planBody.sectorScenarioCode||null,requireExecutionBoundary:true});
  evidence.sector={ready:Boolean(sector.ready),scenarioCode:sector.contract?.scenarioCode||null,failures:sector.failures||[]};
  if(!sector.ready)findings.push(...(sector.failures||['SECTOR_CONTRACT_NOT_READY']).map(code=>({code:`SECTOR:${code}`,severity:'BLOCK'})));

  let assignment=null;
  try{
    assignment=await assessMissionAssignment(env,{companyId:tenant,missionId:mid,reason:'plan_evaluation',candidateLimit:10,persistDecision:false});
    evidence.assignment={current:Boolean(assignment.currentAssignment),decision:assignment.decision?.decisionType||null,candidates:(assignment.candidates||[]).slice(0,5).map(x=>({type:x.type,id:x.id,eligible:x.eligible,score:x.score,situation:x.situation}))};
    if(!assignment.currentAssignment && recommendation?.state==='READY'){
      if(assignment.decision?.decisionType==='ASSIGN'&&assignment.candidates?.some(x=>x.eligible))findings.push({code:'ASSIGNMENT_FEASIBLE_BUT_NOT_ASSIGNED',severity:'REVIEW'});
      else findings.push({code:'NO_FEASIBLE_ASSIGNMENT',severity:'BLOCK'});
    }
    if(assignment.decision?.decisionType==='ESCALATE')findings.push({code:'ASSIGNMENT_CONFLICT_REQUIRES_ESCALATION',severity:'BLOCK'});
  }catch(error){findings.push({code:'ASSIGNMENT_FEASIBILITY_UNAVAILABLE',severity:'BLOCK',detail:clean(error?.code||error?.message||'ASSIGNMENT_UNAVAILABLE',160)});}

  const requiredResources=[...(Array.isArray(sector.contract?.requiredResources)?sector.contract.requiredResources:[])];
  if(planBody.resources?.source)requiredResources.push({resourceType:'configuration',resourceKey:'*',consumerCapability:'planning'});
  const resourceResults=[];
  for(const ref of requiredResources.slice(0,30)){
    try{
      const resource=await requireResourceContract(env,{resourceType:ref.resourceType,resourceKey:ref.resourceKey,consumerCapability:ref.consumerCapability||null,tenantScope:ref.tenantScope||'tenant'});
      resourceResults.push({resourceType:resource.resourceType,resourceKey:resource.resourceKey,ownerCapability:resource.ownerCapability,version:resource.version,stepUpRequired:resource.stepUpRequired});
    }catch(error){findings.push({code:`RESOURCE_UNAVAILABLE:${ref.resourceType}:${ref.resourceKey}`,severity:'BLOCK',detail:clean(error?.code||error?.message||'RESOURCE_UNAVAILABLE',160)});}
  }
  evidence.resources=resourceResults;

  const steps=Array.isArray(planBody.steps)?planBody.steps.map(clean).filter(Boolean):[];
  const duplicateSteps=steps.filter((x,i)=>steps.indexOf(x)!==i);
  evidence.steps={count:steps.length,ordered:steps.length>0,duplicates:[...new Set(duplicateSteps)]};
  if(!steps.length)findings.push({code:'PLAN_STEPS_EMPTY',severity:'BLOCK'});
  if(duplicateSteps.length)findings.push({code:'PLAN_STEP_DUPLICATES',severity:'REVIEW'});

  const confidence=Number(planBody.confidence?.score??planBody.confidence?.value??0);
  evidence.confidence={score:Number.isFinite(confidence)?confidence:0,level:planBody.confidence?.level||'UNKNOWN'};
  if(!Number.isFinite(confidence)||confidence<0.58)findings.push({code:'LOW_PLANNING_CONFIDENCE',severity:'REVIEW'});
  if(String(planBody.recovery?.strategy||'')!=='REPLAN_AND_REAUTHORIZE'||planBody.recovery?.automaticRetry===true)findings.push({code:'RECOVERY_POLICY_UNSAFE',severity:'BLOCK'});
  if(planBody.execution?.allowed===true)findings.push({code:'PLAN_EXECUTION_FLAGGED_ALLOWED',severity:'BLOCK'});
  if(recommendation?.state==='UNKNOWN'||recommendation?.state==='UNAVAILABLE')findings.push({code:'UNCERTAIN_RECOMMENDATION',severity:'EVIDENCE'});

  let control=null;
  try{control=await getAgenticControl(env);evidence.autonomy={mode:control.mode,executionEnabled:Boolean(control.executionEnabled),autonomyLevel:Number(control.autonomyLevel||0)};}catch(error){findings.push({code:'AUTONOMY_CONTROL_UNAVAILABLE',severity:'BLOCK'});}

  const status=classifyFindings(findings);
  const decision={status,acceptable:status==='ACCEPTABLE',canAccept:status==='ACCEPTABLE',requiresHumanReview:status==='REQUIRES_REVIEW',executionAllowed:false,authorizationAllowed:false,assignmentMutationAllowed:false,stale:status==='STALE',reasonCodes:[...new Set(findings.map(x=>x.code))]};
  const evaluationContext={planId:pid,companyId:tenant,missionId:mid,planHash:plan.planHash,plannedContextHash:plan.contextHash,currentContextHash:freshContextHash,currentStateToken,actionCode,status,decision,evidence,findings};
  const evaluationHash=hash(stable(evaluationContext));
  const evaluationKey=hash(`${tenant}:${mid}:${pid}:${plan.planHash}:${evaluationHash}`);
  const existing=await canonicalFirst(env,'SELECT * FROM mission_plan_evaluations WHERE evaluation_key=? LIMIT 1',[evaluationKey],'mission_plan_evaluation_authority');
  if(existing)return {version:MISSION_PLAN_EVALUATION_AUTHORITY_VERSION,idempotent:true,evaluation:normalizeEvaluation(existing)};
  const expiresAt=new Date(Date.now()+15*60*1000).toISOString();
  const row=await env.DB.prepare(`INSERT INTO mission_plan_evaluations(evaluation_key,company_id,mission_id,plan_id,plan_hash,context_hash,state_token,status,evaluation_hash,findings_json,evidence_json,decision_json,source_version,expires_at,created_by_type,created_by_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`).bind(evaluationKey,tenant,mid,pid,plan.planHash,plan.contextHash,currentStateToken,status,evaluationHash,JSON.stringify(findings),JSON.stringify(evidence),JSON.stringify(decision),MISSION_PLAN_EVALUATION_AUTHORITY_VERSION,expiresAt,'mission_plan_evaluation_authority',String(session?.identityId||session?.executorId||'system')).first();
  if(!row)throw fail('MISSION_PLAN_EVALUATION_PERSISTENCE_FAILED',503);
  return {version:MISSION_PLAN_EVALUATION_AUTHORITY_VERSION,idempotent:false,evaluation:normalizeEvaluation(row)};
}

export async function getLatestMissionPlanEvaluation(env,{companyId,missionId,planId}={}){
  const tenant=Number(companyId||0)||0,mid=Number(missionId||0)||0,pid=Number(planId||0)||0;
  if(!tenant||!mid||!pid)throw fail('MISSION_PLAN_EVALUATION_CONTEXT_REQUIRED',400);
  const row=await canonicalFirst(env,'SELECT * FROM mission_plan_evaluations WHERE company_id=? AND mission_id=? AND plan_id=? ORDER BY id DESC LIMIT 1',[tenant,mid,pid],'mission_plan_evaluation_authority');
  return row?normalizeEvaluation(row):null;
}

export function evaluationAllowsAcceptance(evaluation){
  return Boolean(evaluation&&evaluation.status==='ACCEPTABLE'&&evaluation.decision?.canAccept===true&&evaluation.expiresAt&&Date.parse(evaluation.expiresAt)>Date.now());
}

function classifyFindings(findings){
  if(findings.some(x=>x.severity==='STALE'))return 'STALE';
  if(findings.some(x=>x.severity==='BLOCK'))return findings.some(x=>String(x.code).includes('UNSAFE')||String(x.code).includes('RECOVERY_POLICY'))?'UNSAFE':'BLOCKED';
  if(findings.some(x=>x.severity==='EVIDENCE'))return 'INSUFFICIENT_EVIDENCE';
  if(findings.some(x=>x.severity==='REVIEW'))return 'REQUIRES_REVIEW';
  return 'ACCEPTABLE';
}
function normalizePlan(row){return {id:Number(row?.id||0)||null,companyId:Number(row?.company_id||0)||null,missionId:Number(row?.mission_id||0)||null,planHash:row?.plan_hash||null,contextHash:row?.context_hash||null,stateToken:row?.state_token||null,status:row?.status||null,expiresAt:row?.expires_at||null,plan:parse(row?.plan_json,{})};}
function normalizeEvaluation(row){return Object.freeze({id:Number(row?.id||0)||null,evaluationKey:row?.evaluation_key||null,companyId:Number(row?.company_id||0)||null,missionId:Number(row?.mission_id||0)||null,planId:Number(row?.plan_id||0)||null,planHash:row?.plan_hash||null,contextHash:row?.context_hash||null,stateToken:row?.state_token||null,status:row?.status||'UNKNOWN',evaluationHash:row?.evaluation_hash||null,findings:parse(row?.findings_json,[]),evidence:parse(row?.evidence_json,{}),decision:parse(row?.decision_json,{}),sourceVersion:row?.source_version||null,expiresAt:row?.expires_at||null,createdAt:row?.created_at||null});}
