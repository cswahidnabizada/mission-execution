import crypto from 'node:crypto';
import {canonicalAll,canonicalFirst} from '../core/canonical-db.js';
import {requireCapabilityOperation} from './capability-resource-contract.service.js';

export const MISSION_CONTINUITY_AUTHORITY_VERSION='13.6.0';
export const NEXT_SITUATION_STATES=Object.freeze(['NEXT_SITUATION_READY','ACTIONABLE','WAITING','RECOVERY_REQUIRED','TERMINAL','DEFERRED']);

const fail=(code,status=409)=>Object.assign(new Error(code),{code,status});

/**
 * Canonical mission-continuity authority.
 * Owns only the durable, append-only derived continuation signal after an outcome.
 * It never mutates mission truth, authorizes work, assigns an executor, or executes an action.
 */
export async function recordMissionNextSituation(env,{companyId,missionId,outcomeId=null,outcomeCode='UNKNOWN',assignment=null,attempt=null,unresolvedRecovery=false,openCritical=false,terminal=false,context={}}={}){
  const company=Number(companyId||0),mid=Number(missionId||0);
  if(!company||!mid)throw fail('MISSION_CONTINUITY_CONTEXT_REQUIRED',400);
  await requireCapabilityOperation(env,{capabilityCode:'continuity',command:'record_next_situation',riskClass:'low',tenantScope:'tenant'});
  const mission=await canonicalFirst(env,`SELECT id,company_id,status,state_version,updated_at,objective FROM missions WHERE id=? AND company_id=? LIMIT 1`,[mid,company],'mission_authority');
  if(!mission)throw fail('MISSION_NOT_FOUND_OR_ACCESS_DENIED',404);
  const assignmentRow=assignment||await canonicalFirst(env,`SELECT id,assignment_type,assignee_type,assignee_id,status,version,updated_at FROM mission_assignments WHERE company_id=? AND mission_id=? AND status='active' ORDER BY id DESC LIMIT 1`,[company,mid],'mission_assignment_authority');
  const next=deriveCanonicalNextSituation({mission,assignment:assignmentRow,attempt,outcome:String(outcomeCode||'UNKNOWN').toUpperCase(),unresolvedRecovery,openCritical,terminal});
  const sequenceRow=await canonicalFirst(env,`SELECT COALESCE(MAX(sequence_no),0) AS sequence_no FROM mission_next_situations WHERE company_id=? AND mission_id=?`,[company,mid],'mission_continuity_authority');
  const sequence=Number(sequenceRow?.sequence_no||0)+1;
  const contextHash=await sha256(JSON.stringify({company,mid,outcomeId:outcomeId||null,outcomeCode:next.outcomeCode,missionStatus:mission.status,stateVersion:mission.state_version,assignmentId:assignmentRow?.id||null,assignmentVersion:assignmentRow?.version||0,attemptId:attempt?.attempt_id||null,attemptStatus:attempt?.status||null,next,context}));
  const continuityKey=await sha256(`${company}:${mid}:${outcomeId||'none'}:${next.state}:${next.reason}:${next.action||''}:${contextHash}`);
  const existing=await canonicalFirst(env,`SELECT * FROM mission_next_situations WHERE continuity_key=? LIMIT 1`,[continuityKey],'mission_continuity_authority');
  if(existing)return {version:MISSION_CONTINUITY_AUTHORITY_VERSION,idempotent:true,nextSituation:normalize(existing)};
  const insert=()=>env.DB.prepare(`INSERT INTO mission_next_situations(continuity_id,continuity_key,company_id,mission_id,sequence_no,source_outcome_id,mission_state_version,outcome_code,state,reason_code,action_code,assignment_id,assignment_version,attempt_id,context_hash,context_json,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`).bind(crypto.randomUUID(),continuityKey,company,mid,sequence,outcomeId||null,Number(mission.state_version||0)||null,next.outcomeCode,next.state,next.reason,next.action,assignmentRow?.id||null,assignmentRow?.version||null,attempt?.attempt_id||null,contextHash,JSON.stringify(context&&typeof context==='object'?context:{}),new Date().toISOString()).first();
  try {
    const row=await insert();
    return {version:MISSION_CONTINUITY_AUTHORITY_VERSION,idempotent:false,nextSituation:normalize(row)};
  } catch(error) {
    const raced=await canonicalFirst(env,`SELECT * FROM mission_next_situations WHERE continuity_key=? LIMIT 1`,[continuityKey],'mission_continuity_authority');
    if(raced)return {version:MISSION_CONTINUITY_AUTHORITY_VERSION,idempotent:true,nextSituation:normalize(raced)};
    const retrySequence=Number((await canonicalFirst(env,`SELECT COALESCE(MAX(sequence_no),0) AS sequence_no FROM mission_next_situations WHERE company_id=? AND mission_id=?`,[company,mid],'mission_continuity_authority'))?.sequence_no||0)+1;
    const row=await env.DB.prepare(`INSERT INTO mission_next_situations(continuity_id,continuity_key,company_id,mission_id,sequence_no,source_outcome_id,mission_state_version,outcome_code,state,reason_code,action_code,assignment_id,assignment_version,attempt_id,context_hash,context_json,occurred_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`).bind(crypto.randomUUID(),continuityKey,company,mid,retrySequence,outcomeId||null,Number(mission.state_version||0)||null,next.outcomeCode,next.state,next.reason,next.action,assignmentRow?.id||null,assignmentRow?.version||null,attempt?.attempt_id||null,contextHash,JSON.stringify(context&&typeof context==='object'?context:{}),new Date().toISOString()).first();
    return {version:MISSION_CONTINUITY_AUTHORITY_VERSION,idempotent:false,nextSituation:normalize(row),recoveredFromConcurrency:true};
  }
}

export async function getMissionNextSituation(env,{companyId,missionId,limit=20}={}){
  const company=Number(companyId||0),mid=Number(missionId||0);if(!company||!mid)throw fail('MISSION_CONTINUITY_CONTEXT_REQUIRED',400);
  const rows=await canonicalAll(env,`SELECT * FROM mission_next_situations WHERE company_id=? AND mission_id=? ORDER BY sequence_no DESC,id DESC LIMIT ?`,[company,mid,Math.min(100,Math.max(1,Number(limit)||20))],'mission_continuity_authority');
  return rows.map(normalize);
}

export async function getCurrentMissionNextSituation(env,{companyId,missionId}={}){
  const rows=await getMissionNextSituation(env,{companyId,missionId,limit:1});
  return rows[0]||null;
}

function deriveCanonicalNextSituation({mission,assignment,attempt,outcome,unresolvedRecovery,openCritical,terminal}){
  if(unresolvedRecovery||openCritical)return {state:'RECOVERY_REQUIRED',reason:unresolvedRecovery?'EXECUTION_RECOVERY':'CRITICAL_EXCEPTION',action:'REASSESS_AND_RECOVER',outcomeCode:outcome};
  if(terminal&&outcome==='CANCELLED')return {state:'TERMINAL',reason:'MISSION_CANCELLED',action:null,outcomeCode:outcome};
  if(outcome==='ACHIEVED')return {state:'NEXT_SITUATION_READY',reason:'MISSION_OBJECTIVE_ACHIEVED',action:'OBSERVE_NEXT_SITUATION',outcomeCode:outcome};
  if(!assignment)return {state:'ACTIONABLE',reason:'ASSIGNMENT_REQUIRED',action:'MISSION_ASSIGNMENT',outcomeCode:outcome};
  if(String(attempt?.status||'')==='FAILED')return {state:'ACTIONABLE',reason:'EXECUTION_FAILED',action:'REPLAN_AND_REAUTHORIZE',outcomeCode:outcome};
  if(outcome==='PARTIALLY_ACHIEVED')return {state:'ACTIONABLE',reason:'MISSION_REMAINS_OPEN',action:'PLAN_NEXT_ACTION',outcomeCode:outcome};
  if(outcome==='WAITING')return {state:'WAITING',reason:'MISSION_NOT_READY',action:'WAIT_FOR_PRECONDITION',outcomeCode:outcome};
  if(outcome==='BLOCKED')return {state:'RECOVERY_REQUIRED',reason:'MISSION_BLOCKED',action:'REASSESS_AND_RECOVER',outcomeCode:outcome};
  if(outcome==='CANCELLED')return {state:'TERMINAL',reason:'MISSION_CANCELLED',action:null,outcomeCode:outcome};
  return {state:'DEFERRED',reason:'OBJECTIVE_UNPROVEN',action:'GATHER_EVIDENCE_OR_REPLAN',outcomeCode:outcome};
}

function normalize(row){if(!row)return null;return {id:Number(row.id),continuityId:row.continuity_id,continuityKey:row.continuity_key,companyId:Number(row.company_id),missionId:Number(row.mission_id),sequence:Number(row.sequence_no),sourceOutcomeId:row.source_outcome_id||null,missionStateVersion:Number(row.mission_state_version||0)||null,outcome:row.outcome_code,state:row.state,reason:row.reason_code,action:row.action_code||null,assignmentId:Number(row.assignment_id||0)||null,assignmentVersion:Number(row.assignment_version||0)||null,attemptId:row.attempt_id||null,contextHash:row.context_hash,context:parse(row.context_json,{}),occurredAt:row.occurred_at,createdAt:row.created_at};}
function parse(v,f={}){try{const x=JSON.parse(String(v??''));return x??f}catch{return f}}
async function sha256(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
