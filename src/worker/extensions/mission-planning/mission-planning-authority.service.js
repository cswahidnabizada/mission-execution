import crypto from 'node:crypto';
import {canonicalFirst,canonicalAll} from '../../core/canonical-db.js';
import {requireCapabilityOperation} from '../../security/capability-resource-contract.service.js';
import {planAgentMission} from '../agentic-layer/agent-planner.service.js';
import {evaluateMissionPlan,getLatestMissionPlanEvaluation,evaluationAllowsAcceptance} from './mission-plan-evaluation-authority.service.js';

export const MISSION_PLANNING_AUTHORITY_VERSION='14.0.0';
export const MISSION_PLAN_STATES=Object.freeze(['PROPOSED','SUPERSEDED','ACCEPTED','REJECTED','EXPIRED']);
const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
const stable=(v)=>JSON.stringify(v,(k,val)=>val&&typeof val==='object'&&!Array.isArray(val)?Object.keys(val).sort().reduce((o,key)=>(o[key]=val[key],o),{}):val);
async function sha256(value){return crypto.createHash('sha256').update(String(value)).digest('hex');}
function fail(code,status=409,extra={}){const e=Object.assign(new Error(code),{code,status});Object.assign(e,extra);return e;}
function parse(v,f={}){try{return JSON.parse(String(v??''))??f}catch{return f;}}

/** Canonical planning authority: persists governed plan proposals, never mission truth or execution authority. */
export async function createMissionPlan(env,{request,session,companyId,missionId,input={}}={}){
  const tenant=Number(companyId||session?.tenantId||0)||0,mid=Number(missionId||0)||0;
  if(!tenant||!mid)throw fail('MISSION_PLAN_CONTEXT_REQUIRED',400);
  const contract=await requireCapabilityOperation(env,{capabilityCode:'planning',command:'create_plan',riskClass:'high',tenantScope:'tenant',resources:[{resourceType:'configuration',resourceKey:'*'}]});
  const mission=await canonicalFirst(env,'SELECT id,company_id,status,state_version,updated_at,country_code,sector_code,objective,capability_code FROM missions WHERE id=? AND company_id=? LIMIT 1',[mid,tenant],'mission_authority');
  if(!mission)throw fail('MISSION_NOT_FOUND_OR_ACCESS_DENIED',404);
  const advisory=await planAgentMission(env,request,session,mid,{...(input||{}),missionId:mid});
  const recommendation=advisory.recommendedNextAction||null;
  const alternatives=(advisory.candidates||[]).slice(0,10).map(x=>({actionCode:x.actionCode,state:x.state,score:x.score,riskClass:x.riskClass,requiredAutonomy:x.requiredAutonomy,reason:x.reason||null}));
  const constraints={
    truthRequired:true,authorizationRequired:true,verificationRequired:true,
    assignmentRequired:Boolean(recommendation?.state==='READY'),
    canonicalRevalidationRequired:true,
    uncertaintyPolicy:'DEFER_GATHER_EVIDENCE_ESCALATE',
    executionBoundary:'canonical_action_application_service'
  };
  const plan={
    objective:String(advisory.intent?.goal||mission.objective||'').slice(0,500),
    situation:advisory.situation,
    alignment:advisory.alignment,
    steps:advisory.plan?.steps||[],
    recommendedAction:recommendation,
    alternatives,
    constraints,
    risk:advisory.risk,
    confidence:advisory.confidence,
    assignmentContext:{required:Boolean(recommendation?.state==='READY'),source:'mission_assignment_authority'},
    resources:{source:'capability_resource_contract_gateway',contractVersion:contract.version},
    recovery:{strategy:'REPLAN_AND_REAUTHORIZE',automaticRetry:false},
    execution:{allowed:false,reason:'PLANNING_IS_NON_EXECUTING'}
  };
  const contextHash=String(advisory.contextHash||'');
  if(!contextHash)throw fail('MISSION_PLAN_CONTEXT_HASH_REQUIRED',409);
  const canonicalPlan={missionId:mid,companyId:tenant,stateToken:advisory.stateToken||null,contextHash,plan};
  const planHash=await sha256(stable(canonicalPlan));
  const planKey=await sha256(`${tenant}:${mid}:${contextHash}:${planHash}`);
  const latest=await canonicalFirst(env,'SELECT * FROM mission_plans WHERE company_id=? AND mission_id=? AND plan_key=? LIMIT 1',[tenant,mid,planKey],'mission_planning_authority');
  if(latest)return {version:MISSION_PLANNING_AUTHORITY_VERSION,contractVersion:contract.version,idempotent:true,plan:normalizePlan(latest)};
  await env.DB.prepare(`UPDATE mission_plans SET status='SUPERSEDED',updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND mission_id=? AND status='PROPOSED'`).bind(tenant,mid).run();
  const row=await env.DB.prepare(`INSERT INTO mission_plans(plan_key,company_id,mission_id,context_hash,state_token,objective_json,plan_json,plan_hash,status,source_version,created_by_type,created_by_id,expires_at) VALUES(?,?,?,?,?,?,?,?, 'PROPOSED',?,?,?,datetime('now','+15 minutes')) RETURNING *`).bind(planKey,tenant,mid,contextHash,String(advisory.stateToken||''),JSON.stringify({objective:plan.objective}),JSON.stringify(plan),planHash,MISSION_PLANNING_AUTHORITY_VERSION,'mission_planning_authority',String(session?.identityId||session?.executorId||'system')).first();
  if(!row)throw fail('MISSION_PLAN_PERSISTENCE_FAILED',503);
  return {version:MISSION_PLANNING_AUTHORITY_VERSION,contractVersion:contract.version,idempotent:false,plan:normalizePlan(row)};
}

export async function getMissionPlan(env,{companyId,missionId,planId=null}={}){
  const tenant=Number(companyId||0)||0,mid=Number(missionId||0)||0;if(!tenant||!mid)throw fail('MISSION_PLAN_CONTEXT_REQUIRED',400);
  const row=planId?await canonicalFirst(env,'SELECT * FROM mission_plans WHERE id=? AND company_id=? AND mission_id=? LIMIT 1',[Number(planId),tenant,mid],'mission_planning_authority'):await canonicalFirst(env,"SELECT * FROM mission_plans WHERE company_id=? AND mission_id=? AND status IN ('PROPOSED','ACCEPTED') ORDER BY id DESC LIMIT 1",[tenant,mid],'mission_planning_authority');
  return row?normalizePlan(row):null;
}

export async function listMissionPlans(env,{companyId,missionId,limit=20}={}){
  const tenant=Number(companyId||0)||0,mid=Number(missionId||0)||0;if(!tenant||!mid)throw fail('MISSION_PLAN_CONTEXT_REQUIRED',400);
  const rows=await canonicalAll(env,'SELECT * FROM mission_plans WHERE company_id=? AND mission_id=? ORDER BY id DESC LIMIT ?',[tenant,mid,Math.min(100,Math.max(1,Number(limit)||20))],'mission_planning_authority');
  return rows.map(normalizePlan);
}

export async function acceptMissionPlan(env,{request=null,session=null,companyId,missionId,planId}={}){
  const tenant=Number(companyId||0)||0,mid=Number(missionId||0)||0,id=Number(planId||0)||0;if(!tenant||!mid||!id)throw fail('MISSION_PLAN_ACCEPT_CONTEXT_REQUIRED',400);
  await requireCapabilityOperation(env,{capabilityCode:'planning',command:'accept_plan',riskClass:'high',tenantScope:'tenant'});
  const row=await canonicalFirst(env,'SELECT * FROM mission_plans WHERE id=? AND company_id=? AND mission_id=? LIMIT 1',[id,tenant,mid],'mission_planning_authority');
  if(!row)throw fail('MISSION_PLAN_NOT_FOUND',404);
  if(String(row.status)!=='PROPOSED')throw fail('MISSION_PLAN_NOT_PROPOSED',409);
  let evaluation=await getLatestMissionPlanEvaluation(env,{companyId:tenant,missionId:mid,planId:id});
  if(!evaluation||evaluation.planHash!==String(row.plan_hash||'')||!evaluationAllowsAcceptance(evaluation)){
    const evaluated=await evaluateMissionPlan(env,{request,session,companyId:tenant,missionId:mid,planId:id});
    evaluation=evaluated.evaluation;
  }
  if(!evaluationAllowsAcceptance(evaluation))throw fail('MISSION_PLAN_EVALUATION_REQUIRED',422,{evaluation});
  const currentMission=await canonicalFirst(env,'SELECT state_version,updated_at FROM missions WHERE id=? AND company_id=? LIMIT 1',[mid,tenant],'mission_authority');
  const currentToken=Number(currentMission?.state_version||0)>0?`v:${Number(currentMission.state_version)}`:String(currentMission?.updated_at||'');
  if(String(row.state_token||'')!==currentToken)throw fail('MISSION_PLAN_STALE_BEFORE_ACCEPTANCE',409,{expected:currentToken,actual:row.state_token});
  await env.DB.prepare("UPDATE mission_plans SET status='ACCEPTED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND mission_id=? AND status='PROPOSED'").bind(id,tenant,mid).run();
  return normalizePlan(await canonicalFirst(env,'SELECT * FROM mission_plans WHERE id=? LIMIT 1',[id],'mission_planning_authority'));
}

function normalizePlan(row){return Object.freeze({id:Number(row?.id||0)||null,planKey:row?.plan_key||null,companyId:Number(row?.company_id||0)||null,missionId:Number(row?.mission_id||0)||null,contextHash:row?.context_hash||null,stateToken:row?.state_token||null,objective:parse(row?.objective_json,{}),plan:parse(row?.plan_json,{}),planHash:row?.plan_hash||null,status:row?.status||null,sourceVersion:row?.source_version||null,createdAt:row?.created_at||null,updatedAt:row?.updated_at||null,expiresAt:row?.expires_at||null});}
