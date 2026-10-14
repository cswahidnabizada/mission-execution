import crypto from 'node:crypto';
import {canonicalFirst} from '../../core/canonical-db.js';

export const EXECUTION_RUNTIME_HARDENING_VERSION='14.8.0';
export const EXECUTION_SUBJECT_CONTRACT_VERSION='14.8.0';
const SUPPORTED_SUBJECT_TYPES=new Set(['human','executor','driver','device','robot','vehicle','drone','provider']);
const fail=(code,status=409,extra={})=>Object.assign(new Error(code),{code,status,...extra});

/** Runtime fence for real-world execution. It does not own assignment or mission truth. */
export async function captureExecutionRuntimeFence(env,{companyId,missionId}={}){
  const company=Number(companyId||0),mid=Number(missionId||0);if(!company||!mid)throw fail('EXECUTION_RUNTIME_CONTEXT_REQUIRED',400);
  const assignment=await canonicalFirst(env,`SELECT id,assignment_type,assignee_type,assignee_id,status,version,updated_at FROM mission_assignments WHERE company_id=? AND mission_id=? AND status='active' ORDER BY id DESC LIMIT 1`,[company,mid],'mission_assignment_authority');
  if(!assignment)throw fail('EXECUTION_RUNTIME_ASSIGNMENT_REQUIRED',409);
  const subject=await resolveExecutionSubject(env,{companyId:company,missionId:mid,assigneeType:assignment.assignee_type,assigneeId:assignment.assignee_id});
  return Object.freeze({assignmentId:Number(assignment.id),assignmentVersion:Number(assignment.version||0),assigneeType:String(assignment.assignee_type),assigneeId:Number(assignment.assignee_id),subjectKey:subject.subjectKey||null,subjectStatus:subject.status,subjectAuthority:subject.sourceAuthority||null,subjectContractVersion:EXECUTION_SUBJECT_CONTRACT_VERSION,leaseId:crypto.randomUUID(),leaseExpiresAt:new Date(Date.now()+120000).toISOString(),capturedAt:new Date().toISOString()});
}

export async function assertExecutionRuntimeFence(env,{companyId,missionId,assignmentId,assignmentVersion,assigneeType=null,assigneeId=null,subjectKey=null}={}){
  const row=await canonicalFirst(env,`SELECT id,version,assignee_type,assignee_id,status FROM mission_assignments WHERE company_id=? AND mission_id=? AND id=? LIMIT 1`,[Number(companyId),Number(missionId),Number(assignmentId)],'mission_assignment_authority');
  if(!row||String(row.status)!=='active')throw fail('EXECUTION_ASSIGNMENT_FENCE_BROKEN',409,{reason:'ASSIGNMENT_NOT_ACTIVE'});
  if(Number(row.version)!==Number(assignmentVersion))throw fail('EXECUTION_ASSIGNMENT_FENCE_BROKEN',409,{reason:'ASSIGNMENT_VERSION_CHANGED'});
  if(assigneeType!=null&&String(row.assignee_type)!==String(assigneeType))throw fail('EXECUTION_SUBJECT_FENCE_BROKEN',409,{reason:'ASSIGNEE_TYPE_CHANGED'});
  if(assigneeId!=null&&Number(row.assignee_id)!==Number(assigneeId))throw fail('EXECUTION_SUBJECT_FENCE_BROKEN',409,{reason:'ASSIGNEE_ID_CHANGED'});
  const subject=await resolveExecutionSubject(env,{companyId:Number(companyId),missionId:Number(missionId),assigneeType:row.assignee_type,assigneeId:row.assignee_id});
  if(subjectKey!=null&&String(subject.subjectKey||'')!==String(subjectKey))throw fail('EXECUTION_SUBJECT_FENCE_BROKEN',409,{reason:'SUBJECT_KEY_CHANGED'});
  return Object.freeze({valid:true,assignmentId:Number(row.id),assignmentVersion:Number(row.version),assigneeType:String(row.assignee_type),assigneeId:Number(row.assignee_id),subjectKey:subject.subjectKey||null,subjectStatus:subject.status,subjectAuthority:subject.sourceAuthority||null,subjectContractVersion:EXECUTION_SUBJECT_CONTRACT_VERSION});
}

/**
 * Validates the execution subject against its owning identity/resource source.
 * This is a fence only: mission assignment remains the sole assignment authority.
 */
export async function resolveExecutionSubject(env,{companyId,missionId=null,assigneeType,assigneeId}={}){
  const company=Number(companyId||0),id=Number(assigneeId||0),type=String(assigneeType||'').toLowerCase();
  if(!company||!id)throw fail('EXECUTION_SUBJECT_CONTEXT_REQUIRED',400);
  if(!SUPPORTED_SUBJECT_TYPES.has(type))throw fail('EXECUTION_SUBJECT_TYPE_UNSUPPORTED',409,{assigneeType:type});
  if(type==='driver'){
    const row=await canonicalFirst(env,`SELECT id,name,active,deleted_at,company_id FROM drivers WHERE id=? AND company_id=? LIMIT 1`,[id,company],'executor_identity_authority');
    if(!row||Number(row.active)!==1||row.deleted_at)throw fail('EXECUTION_SUBJECT_NOT_ELIGIBLE',409,{reason:'DRIVER_NOT_ACTIVE'});
    return Object.freeze({subjectType:type,subjectId:id,subjectKey:`driver:${id}`,status:'active',sourceAuthority:'executor_identity_authority',displayName:row.name||null});
  }
  if(type==='executor'){
    const row=await canonicalFirst(env,`SELECT e.id,e.display_name,e.deleted_at,tel.status AS tenant_status FROM public_executor_identities e JOIN tenant_executor_links tel ON tel.executor_id=e.id AND tel.company_id=? WHERE e.id=? LIMIT 1`,[company,id],'executor_identity_authority');
    if(!row||row.deleted_at||String(row.tenant_status)!=='approved')throw fail('EXECUTION_SUBJECT_NOT_ELIGIBLE',409,{reason:'EXECUTOR_NOT_APPROVED'});
    return Object.freeze({subjectType:type,subjectId:id,subjectKey:`executor:${id}`,status:'approved',sourceAuthority:'executor_identity_authority',displayName:row.display_name||null});
  }
  const row=await canonicalFirst(env,`SELECT id,subject_type,subject_key,display_name,status,source_authority,source_id,company_id FROM mission_assignment_subjects WHERE id=? AND company_id=? AND subject_type=? LIMIT 1`,[id,company,type],'mission_assignment_subject_authority');
  if(!row||String(row.status)!=='verified')throw fail('EXECUTION_SUBJECT_NOT_ELIGIBLE',409,{reason:'SUBJECT_NOT_VERIFIED',assigneeType:type});
  return Object.freeze({subjectType:type,subjectId:id,subjectKey:String(row.subject_key),status:String(row.status),sourceAuthority:String(row.source_authority||'mission_assignment_subject_authority'),sourceId:row.source_id||null,displayName:row.display_name||null});
}

export async function heartbeatExecutionAttempt(env,{attemptId,leaseId}={}){
  if(!attemptId||!leaseId)throw fail('EXECUTION_RUNTIME_HEARTBEAT_REQUIRED',400);
  const row=await canonicalFirst(env,'SELECT attempt_id,runtime_lease_id,runtime_lease_expires_at,status FROM agent_execution_attempts WHERE attempt_id=? LIMIT 1',[String(attemptId)],'agent_execution_attempt_store');
  if(!row)throw fail('EXECUTION_ATTEMPT_NOT_FOUND',404);
  if(String(row.runtime_lease_id||'')!==String(leaseId))throw fail('EXECUTION_RUNTIME_LEASE_MISMATCH',409);
  if(row.runtime_lease_expires_at&&Date.parse(row.runtime_lease_expires_at)<=Date.now())throw fail('EXECUTION_RUNTIME_LEASE_EXPIRED',409);
  const expires=new Date(Date.now()+120000).toISOString();
  await env.DB.prepare(`UPDATE agent_execution_attempts SET last_heartbeat_at=CURRENT_TIMESTAMP,runtime_lease_expires_at=?,updated_at=CURRENT_TIMESTAMP WHERE attempt_id=? AND runtime_lease_id=?`).bind(expires,String(attemptId),String(leaseId)).run();
  return {attemptId:String(attemptId),leaseId:String(leaseId),leaseExpiresAt:expires,status:String(row.status)};
}
