import {RELEASE_VERSION} from '../core/release.js';

/**
 * Canonical execution-assignment authority.
 *
 * Exactly one active execution assignment may exist for a mission. Legacy
 * mission fields/tables are projections during the migration window only.
 */
export const MISSION_ASSIGNMENT_AUTHORITY_VERSION=RELEASE_VERSION;
export const ASSIGNMENT_TYPES=Object.freeze(['owner_driver','executor','tenant_driver']);
export const ASSIGNEE_TYPES=Object.freeze(['driver','executor','device','robot']);

function clean(v,max=200){return String(v??'').trim().slice(0,max);}
function n(v){const x=Number(v);return Number.isFinite(x)&&x>0?x:null;}

export function normalizeAssignment({companyId,missionId,assignmentType,assigneeType,assigneeId,assigneeCompanyId=null,requestId=null,sourceType='canonical',sourceId=null,metadata={}}={}){
  const owner=n(companyId),mission=n(missionId),id=n(assigneeId);
  if(!owner||!mission)throw new Error('Canonical assignment requires companyId and missionId');
  if(!ASSIGNMENT_TYPES.includes(String(assignmentType)))throw new Error('Invalid canonical assignment type');
  if(!ASSIGNEE_TYPES.includes(String(assigneeType)))throw new Error('Invalid canonical assignee type');
  if(!id)throw new Error('Canonical assignment requires an assignee');
  const assigneeCompany=assigneeCompanyId==null?owner:n(assigneeCompanyId);
  return {companyId:owner,missionId:mission,assignmentType:String(assignmentType),assigneeType:String(assigneeType),assigneeId:id,assigneeCompanyId:assigneeCompany,requestId:n(requestId),sourceType:clean(sourceType,80)||'canonical',sourceId:clean(sourceId,120)||null,metadata:metadata&&typeof metadata==='object'?metadata:{}};
}

function canonicalAssignmentProjectionStatements(){
  // Legacy assignment tables are now frozen historical compatibility data.
  // Runtime assignment truth is exclusively mission_assignments.
  return [];
}

export function canonicalAssignmentStatements(env,input){
  const a=normalizeAssignment(input);
  return [
    env.DB.prepare(`UPDATE mission_assignments SET status='revoked',updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE company_id=? AND mission_id=? AND status='active'`).bind(a.companyId,a.missionId),
    env.DB.prepare(`INSERT INTO mission_assignments(company_id,mission_id,assignment_type,assignee_type,assignee_id,assignee_company_id,request_id,status,assigned_at,created_at,updated_at,version,source_type,source_id,metadata_json) VALUES(?,?,?,?,?,?,?,'active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,1,?,?,?)`).bind(a.companyId,a.missionId,a.assignmentType,a.assigneeType,a.assigneeId,a.assigneeCompanyId,a.requestId,a.sourceType,a.sourceId,JSON.stringify(a.metadata||{})),
    ...canonicalAssignmentProjectionStatements(env,a,{revokeAll:true})
  ];
}

export function canonicalAssignmentRevokeStatements(env,{companyId,missionId,assignmentType=null,assigneeId=null,reason='reassigned'}={}){
  const owner=n(companyId),mission=n(missionId);if(!owner||!mission)throw new Error('Canonical assignment revoke requires companyId and missionId');
  const clauses=['company_id=?','mission_id=?','status=\'active\''];const binds=[owner,mission];
  if(assignmentType){clauses.push('assignment_type=?');binds.push(String(assignmentType));}
  if(assigneeId!=null){clauses.push('assignee_id=?');binds.push(Number(assigneeId));}
  const assignment={companyId:owner,missionId:mission,assignmentType:assignmentType||'owner_driver',assigneeType:'driver',assigneeId:0,assigneeCompanyId:owner};
  return [
    env.DB.prepare(`UPDATE mission_assignments SET status='revoked',metadata_json=json_set(COALESCE(metadata_json,'{}'),'$.revokeReason',?),updated_at=CURRENT_TIMESTAMP,version=version+1 WHERE ${clauses.join(' AND ')}`).bind(String(reason),...binds),
    ...canonicalAssignmentProjectionStatements(env,assignment,{revokeAll:!assignmentType})
  ];
}

export async function getCanonicalMissionAssignment(env,companyId,missionId){
  return env.DB.prepare(`SELECT * FROM mission_assignments WHERE company_id=? AND mission_id=? AND status='active' ORDER BY id DESC LIMIT 1`).bind(Number(companyId),Number(missionId)).first();
}

export async function listCanonicalMissionAssignments(env,companyId,missionId,{includeHistory=false}={}){
  const status=includeHistory?'':' AND status=\'active\'';
  return (await env.DB.prepare(`SELECT * FROM mission_assignments WHERE company_id=? AND mission_id=?${status} ORDER BY id DESC`).bind(Number(companyId),Number(missionId)).all()).results||[];
}

export async function getAssignmentAuthorityHealth(env,{limit=100}={}){
  const subjectCounts=(await env.DB.prepare(`SELECT subject_type,status,COUNT(*) AS count FROM mission_assignment_subjects GROUP BY subject_type,status ORDER BY subject_type,status`).all()).results||[];
  const decisions=(await env.DB.prepare(`SELECT decision_type,status,COUNT(*) AS count FROM mission_assignment_decisions GROUP BY decision_type,status ORDER BY decision_type,status`).all()).results||[];
  const active=(await env.DB.prepare(`SELECT COUNT(*) count FROM mission_assignments WHERE status='active'`).first())?.count||0;
  const conflicts=(await env.DB.prepare(`SELECT COUNT(*) count FROM mission_assignment_reconciliation WHERE status='conflict'`).first())?.count||0;
  const recent=(await env.DB.prepare(`SELECT id,company_id,mission_id,assignment_type,assignee_type,assignee_id,status,source_type,updated_at FROM mission_assignments ORDER BY updated_at DESC,id DESC LIMIT ?`).bind(Math.min(250,Math.max(1,Number(limit)||100))).all()).results||[];
  return {authority:'mission_assignments',version:MISSION_ASSIGNMENT_AUTHORITY_VERSION,activeAssignments:Number(active),reconciliationConflicts:Number(conflicts),subjectCounts,decisions,recent};
}
