import {RELEASE_VERSION} from '../core/release.js';
import {audit} from './audit.js';
import {resolveExternalProviderGovernance,recordExternalProviderAudit} from './external-provider-governance.service.js';

export const BACKUP_RECOVERY_GOVERNANCE_VERSION=RELEASE_VERSION;
const CLASSIFICATIONS=new Set(['PUBLIC','INTERNAL','CONFIDENTIAL','PERSONAL','HIGHLY_SENSITIVE','SECURITY_SENSITIVE']);
const RANK={PUBLIC:0,INTERNAL:1,CONFIDENTIAL:2,PERSONAL:3,HIGHLY_SENSITIVE:4,SECURITY_SENSITIVE:5};
const fail=(code,status=403)=>Object.assign(new Error(code),{status});
const clean=(v,max=240)=>String(v??'').trim().slice(0,max);
const parseJson=(v,fallback={})=>{try{return JSON.parse(String(v??''))}catch{return fallback}};

async function getBackup(env,code){
  const backup=await env.DB.prepare(`SELECT b.*,r.retention_days,r.action_after_expiry,r.legal_hold_allowed,e.contract_status,e.country_code provider_country,e.region_code provider_region,e.residency_mode provider_residency FROM backup_registry b JOIN retention_policies r ON r.code=b.retention_policy_code LEFT JOIN external_provider_registry e ON e.code=b.provider_code WHERE b.code=? AND b.status='active' LIMIT 1`).bind(clean(code,120)).first();
  if(!backup)throw fail('BACKUP_POLICY_NOT_CONFIGURED',503);
  if(String(backup.encryption_status)==='failed')throw fail('BACKUP_ENCRYPTION_NOT_READY',503);
  if(String(backup.contract_status||'')!=='approved')throw fail('BACKUP_PROVIDER_NOT_APPROVED',503);
  return backup;
}

export async function resolveBackupGovernance(env,{backupCode='primary_canonical',companyId=null,countryCode=null,classification='SECURITY_SENSITIVE',dataFields=['backup_payload','source_scope','recovery_point_id','integrity_hash'],authorizationScope='backup_creation',authorizationGranted=true,operation='backup_creation'}={}){
  const backup=await getBackup(env,backupCode);
  const cc=String(countryCode||backup.country_code||'').trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(cc)||cc==='ZZ')throw fail('BACKUP_COUNTRY_UNRESOLVED',409);
  const cls=String(classification||backup.classification).toUpperCase();
  if(!CLASSIFICATIONS.has(cls))throw fail('BACKUP_CLASSIFICATION_INVALID',400);
  if((RANK[String(backup.classification).toUpperCase()]??-1)<(RANK[cls]??99))throw fail('BACKUP_CLASSIFICATION_NOT_ALLOWED');
  if(String(backup.residency_mode)==='required'&&String(backup.region_code).toUpperCase()!==cc)throw fail('BACKUP_RESIDENCY_MISMATCH');
  if(!authorizationGranted)throw fail('BACKUP_AUTHORIZATION_REQUIRED');
  if(String(backup.restore_authorization_scope||'')!==String(authorizationScope||''))throw fail('BACKUP_AUTHORIZATION_SCOPE_MISMATCH');
  const provider=await resolveExternalProviderGovernance(env,{providerCode:backup.provider_code,companyId,countryCode:cc,purposeCode:'backup_recovery',classification:cls,dataFields,authorizationScope,authorizationGranted,operation});
  return Object.freeze({version:BACKUP_RECOVERY_GOVERNANCE_VERSION,backupCode:backup.code,backupName:backup.name,providerCode:backup.provider_code,companyId:companyId?Number(companyId):null,countryCode:cc,jurisdictionCode:backup.jurisdiction_code,regionCode:backup.region_code,purposeCode:'backup_recovery',classification:cls,retentionPolicyCode:backup.retention_policy_code,retentionDays:backup.retention_days==null?null:Number(backup.retention_days),retentionAction:backup.action_after_expiry,legalHoldAllowed:Boolean(Number(backup.legal_hold_allowed)),encryptionMode:backup.encryption_mode,encryptionStatus:backup.encryption_status,legalHoldPropagation:backup.legal_hold_propagation,integrityVerificationRequired:Boolean(Number(backup.integrity_verification_required)),restoreAuthorizationScope:backup.restore_authorization_scope,providerGovernance:provider});
}

export async function recordBackupRecoveryPoint(env,input={}){
  const governance=await resolveBackupGovernance(env,input);
  const recoveryPointId=clean(input.recoveryPointId,160)||crypto.randomUUID();
  const providerObjectRef=clean(input.providerObjectRef,240);
  const integrityHash=clean(input.integrityHash,128);
  if(!providerObjectRef||!integrityHash)throw fail('BACKUP_RECOVERY_POINT_METADATA_REQUIRED',400);
  const capturedAt=clean(input.capturedAt,60)||new Date().toISOString();
  const expiresAt=input.expiresAt==null?null:clean(input.expiresAt,60);
  const classification=String(input.classification||governance.classification).toUpperCase();
  const result=await env.DB.prepare(`INSERT INTO backup_recovery_points(recovery_point_id,backup_code,company_id,source_scope,source_data_version,provider_object_ref,captured_at,expires_at,classification,integrity_hash,integrity_status,encryption_status,residency_region,legal_hold_active,deletion_status,size_bytes,recovery_test_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(recoveryPointId,governance.backupCode,governance.companyId,input.sourceScope==='company'?'company':'platform',clean(input.sourceDataVersion,120)||null,providerObjectRef,capturedAt,expiresAt,classification,integrityHash,input.integrityVerified===false?'pending':'verified',governance.encryptionStatus,governance.regionCode,input.legalHoldActive?1:0,input.legalHoldActive?'blocked_legal_hold':'retained',input.sizeBytes==null?null:Number(input.sizeBytes),input.recoveryTestStatus||'not_tested').run();
  await audit(env,{session:{role:'system',tenantId:governance.companyId||0},action:'backup.recovery_point.recorded',resourceType:'backup_recovery_point',resourceId:recoveryPointId,metadata:{backupCode:governance.backupCode,companyId:governance.companyId,classification,integrityStatus:input.integrityVerified===false?'pending':'verified'}});
  return (await env.DB.prepare(`SELECT * FROM backup_recovery_points WHERE id=? LIMIT 1`).bind(Number(result.meta?.last_row_id||0)).first())||await env.DB.prepare(`SELECT * FROM backup_recovery_points WHERE recovery_point_id=? LIMIT 1`).bind(recoveryPointId).first();
}

export async function createBackupRestoreRequest(env,{recoveryPointId,companyId=null,targetScope='platform',reason,requestedByRole='platform_administrator',requestedById=null,authorizationGranted=false,legalHoldActive=false}={}){
  const point=await env.DB.prepare(`SELECT rp.*,b.restore_authorization_scope,b.legal_hold_propagation,b.provider_code FROM backup_recovery_points rp JOIN backup_registry b ON b.code=rp.backup_code WHERE rp.recovery_point_id=? LIMIT 1`).bind(clean(recoveryPointId,160)).first();
  if(!point)throw fail('BACKUP_RECOVERY_POINT_NOT_FOUND',404);
  if(point.integrity_status!=='verified')throw fail('BACKUP_RECOVERY_POINT_NOT_VERIFIED',409);
  if(point.encryption_status==='failed')throw fail('BACKUP_ENCRYPTION_NOT_READY',409);
  if(String(point.deletion_status)==='expired'||String(point.deletion_status)==='deleted')throw fail('BACKUP_RECOVERY_POINT_EXPIRED',409);
  if(companyId&&point.company_id&&Number(companyId)!==Number(point.company_id))throw fail('BACKUP_COMPANY_SCOPE_MISMATCH',403);
  if(targetScope==='platform'&&companyId)throw fail('BACKUP_TARGET_SCOPE_INVALID',400);
  if(targetScope==='company'&&!companyId)throw fail('BACKUP_COMPANY_REQUIRED',400);
  if(!clean(reason,500))throw fail('BACKUP_RESTORE_REASON_REQUIRED',400);
  if(!authorizationGranted)throw fail('BACKUP_RESTORE_AUTHORIZATION_REQUIRED');
  const hold=legalHoldActive||Number(point.legal_hold_active)===1;
  if(hold&&!Number(point.legal_hold_allowed))throw fail('BACKUP_LEGAL_HOLD_UNSUPPORTED',409);
  const requestId=crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO backup_restore_requests(request_id,recovery_point_id,backup_code,company_id,requested_by_role,requested_by_id,target_scope,reason,authorization_status,authorization_scope,legal_hold_check,execution_status,authorized_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(requestId,Number(point.id),point.backup_code,companyId?Number(companyId):point.company_id||null,requestedByRole,requestedById?Number(requestedById):null,targetScope,clean(reason,500),'authorized',point.restore_authorization_scope,hold?'required':'clear','ready').run();
  await recordExternalProviderAudit(env,{version:BACKUP_RECOVERY_GOVERNANCE_VERSION,providerCode:point.provider_code,companyId:companyId?Number(companyId):point.company_id||null,countryCode:cc,purposeCode:'backup_recovery',classification:point.classification,authorizationScope:point.restore_authorization_scope,auditRequired:true,transferPolicy:'same_jurisdiction',policyVersion:'1',dataFields:['recovery_point_id','source_scope'],operation:'backup_restore_authorization'},'allowed',requestId,{targetScope,legalHold:hold});
  return await env.DB.prepare(`SELECT * FROM backup_restore_requests WHERE request_id=? LIMIT 1`).bind(requestId).first();
}

export async function recordBackupRestoreExecution(env,{requestId,executionStatus,providerExecutionRef=null,errorCode=null}={}){
  const allowed=new Set(['executing','succeeded','failed','cancelled']);
  if(!allowed.has(String(executionStatus)))throw fail('BACKUP_RESTORE_EXECUTION_STATUS_INVALID',400);
  const current=await env.DB.prepare(`SELECT * FROM backup_restore_requests WHERE request_id=? LIMIT 1`).bind(clean(requestId,160)).first();
  if(!current)throw fail('BACKUP_RESTORE_REQUEST_NOT_FOUND',404);
  if(current.authorization_status!=='authorized')throw fail('BACKUP_RESTORE_NOT_AUTHORIZED',403);
  await env.DB.prepare(`UPDATE backup_restore_requests SET execution_status=?,provider_execution_ref=?,error_code=?,executed_at=CASE WHEN ? IN ('executing','succeeded','failed','cancelled') THEN COALESCE(executed_at,CURRENT_TIMESTAMP) ELSE executed_at END,completed_at=CASE WHEN ? IN ('succeeded','failed','cancelled') THEN CURRENT_TIMESTAMP ELSE completed_at END WHERE request_id=?`).bind(String(executionStatus),providerExecutionRef?clean(providerExecutionRef,240):null,errorCode?clean(errorCode,160):null,String(executionStatus),String(executionStatus),String(requestId)).run();
  await audit(env,{session:{role:'system',tenantId:current.company_id||0},action:'backup.restore.execution.recorded',resourceType:'backup_restore_request',resourceId:current.id,metadata:{requestId,executionStatus}});
  return await env.DB.prepare(`SELECT * FROM backup_restore_requests WHERE request_id=? LIMIT 1`).bind(String(requestId)).first();
}

export async function reconcileBackupRecoveryPoint(env,{recoveryPointId,sourceEntityType,sourceEntityId,sourceState,backupState,decision='aligned',companyId=null,legalHoldActive=false,notes=null}={}){
  if(!['aligned','pending','blocked','reconciled'].includes(decision))throw fail('BACKUP_RECONCILIATION_DECISION_INVALID',400);
  const point=await env.DB.prepare(`SELECT id,backup_code,company_id FROM backup_recovery_points WHERE recovery_point_id=? LIMIT 1`).bind(clean(recoveryPointId,160)).first();
  if(!point)throw fail('BACKUP_RECOVERY_POINT_NOT_FOUND',404);
  const eventId=crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO backup_reconciliation_events(event_id,recovery_point_id,company_id,source_entity_type,source_entity_id,source_state,backup_state,decision,legal_hold_active,notes) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(eventId,Number(point.id),companyId?Number(companyId):point.company_id||null,clean(sourceEntityType,80),clean(sourceEntityId,160),clean(sourceState,120),clean(backupState,120),decision,legalHoldActive?1:0,notes?clean(notes,500):null).run();
  return await env.DB.prepare(`SELECT * FROM backup_reconciliation_events WHERE event_id=? LIMIT 1`).bind(eventId).first();
}

export async function getBackupRecoveryGovernance(env){
  const [backups,points,restores,reconciliations]=await Promise.all([
    env.DB.prepare(`SELECT b.*,r.retention_days,r.action_after_expiry,r.legal_hold_allowed,e.name provider_name,e.contract_status,e.region_code provider_region FROM backup_registry b LEFT JOIN retention_policies r ON r.code=b.retention_policy_code LEFT JOIN external_provider_registry e ON e.code=b.provider_code ORDER BY CASE WHEN b.status='active' THEN 1 ELSE 0 END DESC,b.code`).all(),
    env.DB.prepare(`SELECT rp.id,rp.recovery_point_id,rp.backup_code,rp.company_id,rp.source_scope,rp.source_data_version,rp.captured_at,rp.expires_at,rp.classification,rp.integrity_status,rp.encryption_status,rp.residency_region,rp.legal_hold_active,rp.deletion_status,rp.size_bytes,rp.recovery_tested_at,rp.recovery_test_status FROM backup_recovery_points rp ORDER BY rp.id DESC LIMIT 100`).all(),
    env.DB.prepare(`SELECT id,request_id,recovery_point_id,backup_code,company_id,requested_by_role,target_scope,authorization_status,authorization_scope,legal_hold_check,execution_status,requested_at,authorized_at,executed_at,completed_at,error_code FROM backup_restore_requests ORDER BY id DESC LIMIT 100`).all(),
    env.DB.prepare(`SELECT id,event_id,recovery_point_id,company_id,source_entity_type,source_entity_id,source_state,backup_state,decision,legal_hold_active,created_at FROM backup_reconciliation_events ORDER BY id DESC LIMIT 100`).all()
  ]);
  return {backups:backups.results||[],recoveryPoints:points.results||[],restoreRequests:restores.results||[],reconciliations:reconciliations.results||[]};
}
