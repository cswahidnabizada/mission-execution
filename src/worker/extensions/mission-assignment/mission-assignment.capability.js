import crypto from 'node:crypto';
import {canonicalFirst} from '../../core/canonical-db.js';
import {requireCapabilityOperation} from '../../security/capability-resource-contract.service.js';
import {getCanonicalMissionAssignment,canonicalAssignmentStatements} from '../../security/mission-assignment-authority.service.js';
import {buildMissionAssignmentDecision,validateMissionAssignmentDecision} from './mission-assignment.contract.js';
import {assignDriver as legacyAssignDriver} from '../mission-management/custody-responsibility/canonical-custody-responsibility.service.js';

const clean=(v,max=200)=>String(v??'').trim().slice(0,max);
const parse=(v,f={})=>{try{return JSON.parse(String(v??''))??f}catch{return f}};
const clamp=(n,min=0,max=1)=>Math.max(min,Math.min(max,Number(n)||0));
export const MISSION_ASSIGNMENT_CAPABILITY_VERSION='13.4.0';

export async function requireMissionAssignmentCapability(env,{command='recommend_assignment'}={}){
  const risk=['recommend_assignment','read_assignment','list_candidates'].includes(command)?'high':'critical';
  return requireCapabilityOperation(env,{capabilityCode:'mission_assignment',command,riskClass:risk,tenantScope:'tenant',resources:[{resourceType:'assignment_subject',resourceKey:'*'}]});
}

/** Assignment-subject registration is an identity/projection feed, not resource truth. */
export async function registerAssignmentSubject(env,{companyId,subjectType,subjectKey,displayName,sourceAuthority,sourceId=null,status='pending',capabilities=[],constraints={},location={},metadata={}}={}){
  const tenant=Number(companyId||0);if(!tenant)throw fail('ASSIGNMENT_SUBJECT_COMPANY_REQUIRED',400);
  const type=clean(subjectType,30).toLowerCase();
  if(!['human','device','robot','vehicle','drone','provider'].includes(type))throw fail('ASSIGNMENT_SUBJECT_TYPE_INVALID',400);
  const key=clean(subjectKey,180);if(!key)throw fail('ASSIGNMENT_SUBJECT_KEY_REQUIRED',400);
  const authority=clean(sourceAuthority,160);if(!authority)throw fail('ASSIGNMENT_SUBJECT_SOURCE_AUTHORITY_REQUIRED',400);
  const allowed=['pending','verified','blocked','retired'];if(!allowed.includes(String(status)))throw fail('ASSIGNMENT_SUBJECT_STATUS_INVALID',400);
  const row=await env.DB.prepare(`INSERT INTO mission_assignment_subjects(company_id,subject_type,subject_key,display_name,source_authority,source_id,status,capability_codes_json,constraints_json,location_json,metadata_json,last_observed_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(company_id,subject_type,subject_key) DO UPDATE SET display_name=excluded.display_name,source_authority=excluded.source_authority,source_id=excluded.source_id,status=excluded.status,capability_codes_json=excluded.capability_codes_json,constraints_json=excluded.constraints_json,location_json=excluded.location_json,metadata_json=excluded.metadata_json,last_observed_at=excluded.last_observed_at,updated_at=CURRENT_TIMESTAMP
    RETURNING *`).bind(tenant,type,key,clean(displayName,200)||key,authority,sourceId==null?null:clean(sourceId,180),status,JSON.stringify(Array.isArray(capabilities)?capabilities.slice(0,100):[]),JSON.stringify(constraints&&typeof constraints==='object'?constraints:{}),JSON.stringify(location&&typeof location==='object'?location:{}),JSON.stringify(metadata&&typeof metadata==='object'?metadata:{}),status==='verified'?new Date().toISOString():null).first();
  return normalizeSubject(row);
}

export async function assessMissionAssignment(env,{companyId,missionId,reason='mission_assignment',candidateLimit=20,persistDecision=true}={}){
  const tenant=Number(companyId||0),mid=Number(missionId||0);
  if(!tenant||!mid)throw fail('MISSION_ASSIGNMENT_CONTEXT_REQUIRED',400);
  const mission=await canonicalFirst(env,`SELECT id,company_id,reference,status,public_enabled,responsibility_mode,deadline_at_utc,mission_date,pickup_at_utc,delivery_at_utc,capability_code,objective,country_code,sector_code,lifecycle_definition_id,lifecycle_state_code,state_version,updated_at FROM missions WHERE id=? AND company_id=? LIMIT 1`,[mid,tenant],'mission_authority');
  if(!mission)throw fail('MISSION_NOT_FOUND_OR_ACCESS_DENIED',404);
  const current=await getCanonicalMissionAssignment(env,tenant,mid);
  const existing=await existingOwnership(env,tenant,mid);
  const candidates=await discoverCandidates(env,tenant,{limit:candidateLimit});
  const scored=candidates.map(candidate=>scoreCandidate(candidate,mission,current));
  const ranked=scored.filter(candidate=>candidate.eligible).sort((a,b)=>b.score-a.score||a.priority-b.priority).slice(0,Math.min(50,Math.max(1,Number(candidateLimit)||20)));
  const top=ranked[0]||null;
  let decisionType='WAIT',confidence=0,reasons=['No verified eligible execution subject is currently available.'];
  if(existing.conflict){decisionType='ESCALATE';reasons=['Multiple active execution-owner signals require reconciliation before assignment.'];}
  else if(!top){decisionType=Number(mission.public_enabled||0)===1?'SHARE':'WAIT';reasons=[Number(mission.public_enabled||0)===1?'No verified eligible subject is available; governed sharing is the next safe acquisition path.':'No verified eligible execution subject is currently available.'];}
  else if(top){decisionType=current?'REASSIGN':'ASSIGN';confidence=clamp((top.score/100)*0.9+(top.evidenceCompleteness*0.1));reasons=top.reasons;if(current&&sameTarget(current,top)){decisionType='WAIT';reasons=['Current assignment remains the best verified execution subject.'];}}
  const decision=buildMissionAssignmentDecision({missionId:mid,decisionType,target:top?{type:top.assigneeType,id:top.id,name:top.name}:null,score:top?.score||null,confidence,reasons,constraints:top?.constraints||[],contextHash:hash({mission,current,existing,ranked:ranked.slice(0,10)})});
  const failures=validateMissionAssignmentDecision(decision);if(failures.length)throw fail('MISSION_ASSIGNMENT_DECISION_INVALID',500,{failures});
  let persisted=null;
  if(persistDecision){
    persisted=await env.DB.prepare(`INSERT INTO mission_assignment_decisions(company_id,mission_id,decision_type,target_type,target_id,score,confidence,status,reason_json,context_json,created_by_type,expires_at)
      VALUES(?,?,?,?,?,?,?,'RECOMMENDED',?,?,?,datetime('now','+15 minutes')) RETURNING id,created_at,expires_at`).bind(tenant,mid,decision.decisionType,decision.target?.type||null,decision.target?.id||null,decision.score,decision.confidence,JSON.stringify(decision.reasons),JSON.stringify({reason:clean(reason,200),contextHash:decision.contextHash,candidates:ranked.slice(0,10).map(publicCandidate)}),'mission_assignment_capability').first();
  }
  return Object.freeze({version:MISSION_ASSIGNMENT_CAPABILITY_VERSION,mission:missionSummary(mission),currentAssignment:current||null,decision:Object.freeze({...decision,decisionId:Number(persisted?.id||0)||null,createdAt:persisted?.created_at||null,expiresAt:persisted?.expires_at||null,persisted:Boolean(persisted)}),candidates:ranked.map(publicCandidate)});
}

export async function assignMission(env,{session=null,companyId,missionId,targetType,targetId,requestId=null,decisionId=null,reason='approved_mission_assignment'}={}){
  const tenant=Number(companyId||0),mid=Number(missionId||0),id=Number(targetId||0);
  if(!tenant||!mid||!id)throw fail('MISSION_ASSIGNMENT_TARGET_REQUIRED',400);
  const contract=await requireMissionAssignmentCapability(env,{command:'assign_mission'});
  const mission=await canonicalFirst(env,`SELECT id,company_id,status,state_version,updated_at FROM missions WHERE id=? AND company_id=? LIMIT 1`,[mid,tenant],'mission_authority');
  if(!mission)throw fail('MISSION_NOT_FOUND_OR_ACCESS_DENIED',404);
  if(['Completed','Cancelled','Canceled'].includes(String(mission.status||'')))throw fail('MISSION_ASSIGNMENT_CLOSED_MISSION',409);
  const target=await resolveTarget(env,tenant,String(targetType||''),id);
  if(!target.eligible)throw fail('MISSION_ASSIGNMENT_TARGET_NOT_ELIGIBLE',409,{reasons:target.reasons});
  if(decisionId)await assertDecision(env,tenant,mid,decisionId,target);
  const current=await getCanonicalMissionAssignment(env,tenant,mid);
  if(['PickedUp','InTransit'].includes(String(mission.status||'')) && current && !sameTarget(current,target))throw fail('MISSION_ASSIGNMENT_CUSTODY_ACTIVE',409);
  if(!decisionId)throw fail('MISSION_ASSIGNMENT_DECISION_REQUIRED',409);
  if(target.assigneeType==='driver'){
    if(!session)throw fail('MISSION_ASSIGNMENT_SESSION_REQUIRED_FOR_DRIVER',403);
    const result=await legacyAssignDriver(env,session,mid,id,null);
    await acceptDecision(env,tenant,mid,decisionId);
    return result;
  }
  await env.DB.batch(canonicalAssignmentStatements(env,{companyId:tenant,missionId:mid,assignmentType:'executor',assigneeType:target.assigneeType,assigneeId:id,assigneeCompanyId:tenant,requestId,sourceType:'mission_assignment_capability',sourceId:decisionId?String(decisionId):null,metadata:{reason:clean(reason,500),contractVersion:contract.version,subjectKey:target.subjectKey||null}}));
  if(decisionId)await acceptDecision(env,tenant,mid,decisionId);
  return {missionId:mid,assignment:await getCanonicalMissionAssignment(env,tenant,mid),contractVersion:contract.version};
}

export async function listAssignmentCandidates(env,{companyId,missionId,limit=20}={}){
  const result=await assessMissionAssignment(env,{companyId,missionId,reason:'candidate_query',candidateLimit:limit});
  return {version:result.version,mission:result.mission,currentAssignment:result.currentAssignment,candidates:result.candidates,decision:result.decision};
}

export async function suggestAssignmentAction(env,{companyId,missionId,action='recommend'}={}){
  const result=await assessMissionAssignment(env,{companyId,missionId,reason:action,candidateLimit:20});
  return result.decision;
}

async function discoverCandidates(env,companyId,{limit=20}={}){
  const n=Math.min(100,Math.max(1,Number(limit)||20));
  const rows=(await env.DB.prepare(`SELECT d.id,d.name,d.company_id,d.active,p.situation,p.situation_note,p.current_location,p.location_updated_at,p.vehicle_type
    FROM drivers d LEFT JOIN driver_operational_profiles p ON p.driver_id=d.id AND p.company_id=d.company_id
    WHERE d.company_id=? AND d.active=1 AND d.deleted_at IS NULL ORDER BY d.id DESC LIMIT ?`).bind(companyId,n).all()).results||[];
  const subjects=(await env.DB.prepare(`SELECT id,subject_type,subject_key,display_name,status,capability_codes_json,constraints_json,location_json,metadata_json,last_observed_at
    FROM mission_assignment_subjects WHERE company_id=? AND status='verified' AND subject_type IN ('human','device','robot','vehicle','drone','provider') ORDER BY updated_at DESC,id DESC LIMIT ?`).bind(companyId,n).all()).results||[];
  const execs=(await env.DB.prepare(`SELECT e.id,e.display_name,tel.company_id,p.situation,p.situation_note,p.current_location,p.location_updated_at
    FROM public_executor_identities e JOIN tenant_executor_links tel ON tel.executor_id=e.id AND tel.company_id=? AND tel.status='approved' LEFT JOIN executor_operational_profiles p ON p.executor_id=e.id
    WHERE e.deleted_at IS NULL ORDER BY e.id DESC LIMIT ?`).bind(companyId,n).all()).results||[];
  const out=[];
  for(const r of rows)out.push({assignmentType:'driver',assigneeType:'driver',id:Number(r.id),name:r.name,status:r.situation||'Unknown',situation:r.situation||'Unknown',capabilities:r.vehicle_type?[String(r.vehicle_type)]:[],constraints:{},location:{text:r.current_location||null},evidenceCompleteness:r.situation&&r.location_updated_at?1:0.75,priority:1});
  for(const r of execs)out.push({assignmentType:'executor',assigneeType:'executor',id:Number(r.id),name:r.display_name||`Executor ${r.id}`,status:r.situation||'Unknown',situation:r.situation||'Unknown',capabilities:[],constraints:{},location:{text:r.current_location||null},evidenceCompleteness:r.situation&&r.location_updated_at?1:0.7,priority:2});
  for(const r of subjects){const metadata=parse(r.metadata_json,{});out.push({assignmentType:'executor',assigneeType:String(r.subject_type),id:Number(r.id),name:r.display_name,subjectKey:r.subject_key,status:r.status,situation:metadata.situation||'Available',capabilities:parse(r.capability_codes_json,[]),constraints:parse(r.constraints_json,{}),location:parse(r.location_json,{}),evidenceCompleteness:r.last_observed_at?1:0.8,priority:r.subject_type==='robot'?3:4});}
  return out;
}

function scoreCandidate(c,mission,current){
  const reasons=[];let score=0;const situation=String(c.situation||c.status||'Unknown').toLowerCase();
  const eligibleSituation=['available','ready','idle'].includes(situation);
  if(eligibleSituation){score+=40;reasons.push('Available/ready operational state.');}
  else if(['driving','traffic','break'].includes(situation)){reasons.push('Operational state is constrained; automatic assignment is not permitted.');}
  else reasons.push('Operational availability is unknown; automatic assignment is not permitted.');
  const required=String(mission.capability_code||'').trim();
  if(required&&c.capabilities.map(String).includes(required)){score+=25;reasons.push(`Required capability ${required} is explicitly registered.`);}
  else if(required){reasons.push(`Required capability ${required} is not evidenced.`);score-=40;}
  else {score+=10;reasons.push('Mission declares no additional capability constraint.');}
  if(current&&sameTarget(current,c)){score+=20;reasons.push('Current assignment is preserved when still suitable.');}
  if(c.evidenceCompleteness>=0.95){score+=10;reasons.push('Fresh operational evidence is present.');}else{score+=2;reasons.push('Operational evidence is incomplete.');}
  if(['human','device','robot','vehicle','drone','provider'].includes(c.assigneeType))reasons.push(`${c.assigneeType} assignment requires verified subject registration and current resource evidence.`);
  return {...c,eligible:Boolean(eligibleSituation&&score>0),score:Math.max(0,Math.min(100,score)),reasons};
}

async function resolveTarget(env,companyId,targetType,targetId){
  const type=String(targetType||'').toLowerCase(),id=Number(targetId||0);
  if(type==='driver'){const r=await env.DB.prepare(`SELECT id,name,active,deleted_at FROM drivers WHERE id=? AND company_id=? LIMIT 1`).bind(id,companyId).first();return {eligible:Boolean(r&&Number(r.active)===1&&!r.deleted_at),assignmentType:'executor',assigneeType:'driver',id,name:r?.name||null,reasons:r?[]:['Driver is missing or inactive.']};}
  if(type==='executor'){const r=await env.DB.prepare(`SELECT e.id,e.display_name,e.deleted_at FROM public_executor_identities e JOIN tenant_executor_links tel ON tel.executor_id=e.id AND tel.company_id=? AND tel.status='approved' WHERE e.id=? LIMIT 1`).bind(companyId,id).first();return {eligible:Boolean(r&&!r.deleted_at),assignmentType:'executor',assigneeType:'executor',id,name:r?.display_name||null,reasons:r?[]:['Executor is missing or deleted.']};}
  if(['device','robot'].includes(type)){const r=await env.DB.prepare(`SELECT id,subject_key,display_name,status,subject_type FROM mission_assignment_subjects WHERE id=? AND company_id=? AND subject_type=? LIMIT 1`).bind(id,companyId,type).first();return {eligible:Boolean(r&&r.status==='verified'),assignmentType:'executor',assigneeType:type,id,subjectKey:r?.subject_key||null,name:r?.display_name||null,reasons:r?[]:['Subject is not verified.']};}
  return {eligible:false,reasons:['Unsupported assignment target type.']};
}

async function assertDecision(env,companyId,missionId,decisionId,target){const d=await canonicalFirst(env,`SELECT id,status,decision_type,target_type,target_id,expires_at FROM mission_assignment_decisions WHERE company_id=? AND mission_id=? AND id=? LIMIT 1`,[companyId,missionId,Number(decisionId)],'mission_assignment_authority');if(!d)throw fail('MISSION_ASSIGNMENT_DECISION_NOT_FOUND',404);if(d.status!=='RECOMMENDED')throw fail('MISSION_ASSIGNMENT_DECISION_NOT_CURRENT',409);if(d.expires_at&&Date.parse(d.expires_at)<=Date.now())throw fail('MISSION_ASSIGNMENT_DECISION_EXPIRED',409);if(String(d.target_type)!==String(target.assigneeType)||Number(d.target_id)!==Number(target.id))throw fail('MISSION_ASSIGNMENT_DECISION_TARGET_MISMATCH',409);}
async function acceptDecision(env,companyId,missionId,decisionId){await env.DB.prepare(`UPDATE mission_assignment_decisions SET status='ACCEPTED',accepted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE company_id=? AND mission_id=? AND id=? AND status='RECOMMENDED'`).bind(companyId,missionId,Number(decisionId)).run();}
async function existingOwnership(env,companyId,missionId){const rows=(await env.DB.prepare(`SELECT assignment_type,assignee_type,assignee_id FROM mission_assignments WHERE company_id=? AND mission_id=? AND status='active' ORDER BY id DESC`).bind(companyId,missionId).all()).results||[];return {conflict:rows.length>1,owners:rows};}
function sameTarget(a,b){return a&&b&&String(a.assignee_type||a.target_type||a.type)===String(b.assigneeType||b.target_type||b.type)&&Number(a.assignee_id||a.target_id||a.id)===Number(b.assigneeId||b.targetId||b.id);}
function publicCandidate(c){return {type:c.assigneeType,id:c.id,name:c.name,eligible:Boolean(c.eligible),score:c.score,situation:c.situation||c.status,evidenceCompleteness:c.evidenceCompleteness,reasons:c.reasons,capabilities:c.capabilities};}
function missionSummary(m){return {id:Number(m.id),reference:m.reference,status:m.status,publicEnabled:Number(m.public_enabled||0)===1,responsibilityMode:m.responsibility_mode||null,sectorCode:m.sector_code,countryCode:m.country_code,capabilityCode:m.capability_code,objective:m.objective,deadlineAt:m.deadline_at_utc||null,stateVersion:Number(m.state_version||0)};}
function normalizeSubject(row){return row?{id:Number(row.id),companyId:Number(row.company_id),subjectType:String(row.subject_type),subjectKey:String(row.subject_key),displayName:String(row.display_name),sourceAuthority:String(row.source_authority),sourceId:row.source_id||null,status:String(row.status),capabilities:parse(row.capability_codes_json,[]),constraints:parse(row.constraints_json,{}),location:parse(row.location_json,{}),metadata:parse(row.metadata_json,{}),lastObservedAt:row.last_observed_at||null}:null;}
function hash(v){return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');}
function fail(code,status=409,extra={}){const e=Object.assign(new Error(code),{code,status});Object.assign(e,extra);return e;}
