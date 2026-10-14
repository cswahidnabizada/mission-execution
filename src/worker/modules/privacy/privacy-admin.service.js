import {canonicalFirst} from '../../core/canonical-db.js';
import {auditAdminControl} from '../admin-control/admin-control.audit.js';

const STATUSES=new Set(['received','processing','completed','partially_completed','restricted','rejected','cancelled']);
const TRANSITIONS={
  received:new Set(['processing','rejected','cancelled']),
  processing:new Set(['completed','partially_completed','restricted','rejected','cancelled']),
  restricted:new Set(['processing','completed','partially_completed','cancelled']),
  completed:new Set(),partially_completed:new Set(),rejected:new Set(),cancelled:new Set()
};
const TYPES=new Set(['access','rectification','erasure','restriction','export','objection','consent_withdrawal']);
function err(message,status=400,code=null){const e=new Error(message);e.status=status;if(code)e.code=code;return e;}
function clean(v,max=1000){return String(v??'').trim().slice(0,max);}

export async function listPrivacyRequestsForAdmin(env,{status=null,requestType=null,companyId=null}={}){
  const clauses=[];const binds=[];
  if(status){if(!STATUSES.has(status))throw err('Invalid privacy request status');clauses.push('pr.status=?');binds.push(status);}
  if(requestType){if(!TYPES.has(requestType))throw err('Invalid privacy request type');clauses.push('pr.request_type=?');binds.push(requestType);}
  if(companyId!==null&&companyId!==undefined&&companyId!==''){const id=Number(companyId);if(!Number.isInteger(id)||id<=0)throw err('Invalid company id');clauses.push('pr.company_id=?');binds.push(id);}
  const where=clauses.length?`WHERE ${clauses.join(' AND ')}`:'';
  const rows=await env.DB.prepare(`SELECT pr.id,pr.company_id,pr.identity_type,pr.identity_id,pr.request_type,pr.status,pr.reason,pr.policy_version,pr.requested_at,pr.due_at,pr.completed_at,pr.outcome_code,pr.outcome_note,pr.assigned_role,pr.assigned_at,pr.last_reviewed_at,pr.legal_hold_active,pr.response_channel,COALESCE(cmp.legal_name,c.name) company_name FROM privacy_requests pr LEFT JOIN companies c ON c.id=pr.company_id LEFT JOIN company_management_profiles cmp ON cmp.company_id=pr.company_id ${where} ORDER BY CASE pr.status WHEN 'received' THEN 0 WHEN 'processing' THEN 1 WHEN 'restricted' THEN 2 ELSE 3 END,pr.requested_at DESC LIMIT 250`).bind(...binds).all();
  return (rows.results||[]).map(normalize);
}

export async function getPrivacyRequestForAdmin(env,id){
  const row=await env.DB.prepare(`SELECT pr.id,pr.company_id,pr.identity_type,pr.identity_id,pr.request_type,pr.status,pr.reason,pr.policy_version,pr.requested_at,pr.due_at,pr.completed_at,pr.outcome_code,pr.outcome_note,pr.assigned_role,pr.assigned_at,pr.last_reviewed_at,pr.legal_hold_active,pr.response_channel,COALESCE(cmp.legal_name,c.name) company_name FROM privacy_requests pr LEFT JOIN companies c ON c.id=pr.company_id LEFT JOIN company_management_profiles cmp ON cmp.company_id=pr.company_id WHERE pr.id=? LIMIT 1`).bind(Number(id)).first();
  if(!row)throw err('Privacy request not found',404);
  const events=(await env.DB.prepare(`SELECT id,from_status,to_status,actor_role,actor_identity_id,note,outcome_code,created_at FROM privacy_request_events WHERE privacy_request_id=? ORDER BY id DESC LIMIT 100`).bind(Number(id)).all()).results||[];
  return {...normalize(row),events};
}

export async function transitionPrivacyRequest(env,actor,id,{status,note='',outcomeCode=null,responseChannel=null}={},requestId=null){
  const target=clean(status,40);if(!STATUSES.has(target))throw err('Invalid privacy request status');
  const current=await env.DB.prepare(`SELECT * FROM privacy_requests WHERE id=? LIMIT 1`).bind(Number(id)).first();
  if(!current)throw err('Privacy request not found',404);
  if(current.status===target)throw err('Privacy request is already in that state',409);
  if(!TRANSITIONS[current.status]?.has(target))throw err(`Invalid privacy request transition: ${current.status} -> ${target}`,409);
  if(current.request_type==='erasure' && target==='completed'){
    throw err('Erasure requests are completed only by the canonical account deletion flow',409,'USE_ACCOUNT_DELETION');
  }
  if(current.request_type==='export' && target==='completed'){
    throw err('Export requests are fulfilled through the canonical personal-data export flow',409,'USE_PERSONAL_EXPORT');
  }
  const safeNote=clean(note,1000)||null;const safeOutcome=clean(outcomeCode,120)||null;const channel=clean(responseChannel,80)||null;
  const completed=['completed','partially_completed','rejected','cancelled'].includes(target)?new Date().toISOString():null;
  await env.DB.prepare(`UPDATE privacy_requests SET status=?,outcome_code=COALESCE(?,outcome_code),outcome_note=COALESCE(?,outcome_note),completed_at=?,last_reviewed_at=CURRENT_TIMESTAMP,response_channel=COALESCE(?,response_channel),assigned_role=COALESCE(assigned_role,'platform_administrator'),assigned_at=COALESCE(assigned_at,CURRENT_TIMESTAMP) WHERE id=?`).bind(target,safeOutcome,safeNote,completed,channel,Number(id)).run();
  await env.DB.prepare(`INSERT INTO privacy_request_events(privacy_request_id,from_status,to_status,actor_role,actor_identity_id,note,outcome_code) VALUES(?,?,?,?,?,?,?)`).bind(Number(id),current.status,target,'platform_administrator',actor?.identityId||null,safeNote,safeOutcome).run();
  await auditAdminControl(env,{actor,action:`admin.privacy_request.${target}`,resourceType:'privacy_request',resourceId:Number(id),targetCompanyId:current.company_id||null,requestId,metadata:{requestType:current.request_type,fromStatus:current.status,toStatus:target,outcomeCode:safeOutcome}});
  return getPrivacyRequestForAdmin(env,id);
}

export async function assignPrivacyRequest(env,actor,id,{assignedRole='platform_administrator',responseChannel=null}={},requestId=null){
  const role=clean(assignedRole,80)||'platform_administrator';
  const row=await env.DB.prepare(`SELECT id,company_id,status,request_type FROM privacy_requests WHERE id=? LIMIT 1`).bind(Number(id)).first();
  if(!row)throw err('Privacy request not found',404);
  await env.DB.prepare(`UPDATE privacy_requests SET assigned_role=?,assigned_at=CURRENT_TIMESTAMP,last_reviewed_at=CURRENT_TIMESTAMP,response_channel=COALESCE(?,response_channel) WHERE id=?`).bind(role,clean(responseChannel,80)||null,Number(id)).run();
  await auditAdminControl(env,{actor,action:'admin.privacy_request.assigned',resourceType:'privacy_request',resourceId:Number(id),targetCompanyId:row.company_id||null,requestId,metadata:{assignedRole:role,requestType:row.request_type}});
  return getPrivacyRequestForAdmin(env,id);
}

export async function createPrivacyLegalHold(env,actor,{privacyRequestId,reason,scopeType='account',scopeId=null},requestId=null){
  const request=await env.DB.prepare(`SELECT id,company_id,identity_type,identity_id,status,request_type FROM privacy_requests WHERE id=? LIMIT 1`).bind(Number(privacyRequestId)).first();
  if(!request)throw err('Privacy request not found',404);
  const safeReason=clean(reason,1000);if(!safeReason)throw err('Legal hold reason is required');
  const allowed=new Set(['account','company','mission','audit','file','evidence']);if(!allowed.has(scopeType))throw err('Invalid legal hold scope');
  const scope=scopeId===null||scopeId===undefined||scopeId===''?null:Number(scopeId);
  if(scope!==null&&!Number.isInteger(scope))throw err('Invalid legal hold scope id');
  const existing=await canonicalFirst(env,`SELECT id FROM privacy_legal_holds WHERE active=1 AND scope_type=? AND ((scope_id IS NULL AND ? IS NULL) OR scope_id=?) AND company_id IS ? LIMIT 1`,[scopeType,scope,scope,request.company_id??null],'privacy_legal_hold_authority');
  if(existing)throw err('An active legal hold already exists for this scope',409);
  const r=await env.DB.prepare(`INSERT INTO privacy_legal_holds(company_id,identity_type,identity_id,scope_type,scope_id,reason,policy_version,active) VALUES(?,?,?,?,?,?,?,1)`).bind(request.company_id??null,request.identity_type,request.identity_id,scopeType,scope,safeReason,'current').run();
  await env.DB.prepare(`UPDATE privacy_requests SET legal_hold_active=1,last_reviewed_at=CURRENT_TIMESTAMP WHERE id=?`).bind(Number(privacyRequestId)).run();
  await auditAdminControl(env,{actor,action:'admin.privacy_request.legal_hold.created',resourceType:'privacy_legal_hold',resourceId:Number(r.meta.last_row_id),targetCompanyId:request.company_id||null,requestId,metadata:{privacyRequestId:Number(privacyRequestId),scopeType}});
  return getPrivacyRequestForAdmin(env,privacyRequestId);
}

export async function releasePrivacyLegalHold(env,actor,holdId,requestId=null){
  const hold=await env.DB.prepare(`SELECT id,company_id,scope_type,scope_id,identity_type,identity_id,active FROM privacy_legal_holds WHERE id=? LIMIT 1`).bind(Number(holdId)).first();
  if(!hold)throw err('Legal hold not found',404);if(Number(hold.active)!==1)throw err('Legal hold is already released',409);
  await env.DB.prepare(`UPDATE privacy_legal_holds SET active=0,released_at=CURRENT_TIMESTAMP WHERE id=?`).bind(Number(holdId)).run();
  await env.DB.prepare(`UPDATE privacy_requests SET legal_hold_active=CASE WHEN EXISTS(SELECT 1 FROM privacy_legal_holds h WHERE h.active=1 AND h.company_id IS privacy_requests.company_id AND h.identity_type=privacy_requests.identity_type AND h.identity_id=privacy_requests.identity_id) THEN 1 ELSE 0 END,last_reviewed_at=CURRENT_TIMESTAMP WHERE company_id IS ? AND identity_type=? AND identity_id=?`).bind(hold.company_id??null,hold.identity_type,hold.identity_id).run();
  await auditAdminControl(env,{actor,action:'admin.privacy_request.legal_hold.released',resourceType:'privacy_legal_hold',resourceId:Number(holdId),targetCompanyId:hold.company_id||null,requestId,metadata:{scopeType:hold.scope_type}});
  return {id:Number(holdId),active:false};
}

function normalize(r){return {id:Number(r.id),companyId:r.company_id===null?null:Number(r.company_id),companyName:r.company_name||null,identityType:r.identity_type,identityId:Number(r.identity_id),requestType:r.request_type,status:r.status,reason:r.reason||null,policyVersion:r.policy_version,requestedAt:r.requested_at,dueAt:r.due_at||null,completedAt:r.completed_at||null,outcomeCode:r.outcome_code||null,outcomeNote:r.outcome_note||null,assignedRole:r.assigned_role||null,assignedAt:r.assigned_at||null,lastReviewedAt:r.last_reviewed_at||null,legalHoldActive:Number(r.legal_hold_active)===1,responseChannel:r.response_channel||null};}
