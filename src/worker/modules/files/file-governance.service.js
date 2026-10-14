import { authorityUnavailable } from '../../core/canonical-db.js';
import {canonicalFirst} from '../../core/canonical-db.js';
import {RELEASE_VERSION} from '../../core/release.js';
/**
 * ON Mission 10.35.5 — Canonical File & Evidence Governance.
 *
 * One authority for file policy resolution, access decisions and disposition.
 * R2 stores bytes; D1 stores the canonical governance record.
 */
import { resolveMissionAccess } from '../../security/mission-access.js';
import { resolveCanonicalComplianceContext } from '../../security/compliance-context.service.js';
import { dataPlanePolicy, assertDataPlanePolicy } from '../../security/data-residency.service.js';
import { prepareCriticalAudit, completeCriticalAudit } from '../../security/critical-audit.service.js';
import { audit } from '../../security/audit.js';
import { resolveExternalProviderGovernance } from '../../security/external-provider-governance.service.js';

export const FILE_GOVERNANCE_VERSION=RELEASE_VERSION;
const CLASSIFICATIONS = new Set(['PUBLIC','INTERNAL','CONFIDENTIAL','PERSONAL','HIGHLY_SENSITIVE','SECURITY_SENSITIVE']);
const PURPOSES = new Set(['MISSION_EXECUTION','COMMUNICATION','IDENTITY_VERIFICATION','COMPLIANCE','EVIDENCE','ACCOUNT_MANAGEMENT']);
const EVIDENCE_TYPES = new Set(['attachment','evidence','critical_evidence','compliance_evidence']);

export async function resolveFilePolicy(env, { purposeCode='MISSION_EXECUTION', classification=null, evidenceType='attachment', jurisdictionCode=null }={}) {
  const purpose = String(purposeCode||'MISSION_EXECUTION').toUpperCase();
  if(!String(jurisdictionCode||'').trim()) throw governanceError('FILE_JURISDICTION_UNRESOLVED',409);
  if(!PURPOSES.has(purpose)) throw governanceError('FILE_PURPOSE_NOT_ALLOWED',400);
  const purposeRow = await env.DB.prepare(`SELECT * FROM file_purpose_catalog WHERE code=? AND active=1 LIMIT 1`).bind(purpose).first();
  if(!purposeRow) throw governanceError('FILE_PURPOSE_NOT_CONFIGURED',503);
  const evidence = String(evidenceType||'attachment').toLowerCase();
  if(!EVIDENCE_TYPES.has(evidence)) throw governanceError('FILE_EVIDENCE_TYPE_NOT_ALLOWED',400);
  const requested = classification ? String(classification).toUpperCase() : String(purposeRow.default_classification).toUpperCase();
  if(!CLASSIFICATIONS.has(requested)) throw governanceError('FILE_CLASSIFICATION_NOT_ALLOWED',400);
  if(purpose==='IDENTITY_VERIFICATION' && requested!=='HIGHLY_SENSITIVE') throw governanceError('IDENTITY_FILE_CLASSIFICATION_REQUIRED',400);
  const retention = await env.DB.prepare(`SELECT code,retention_days,action_after_expiry,legal_hold_allowed,version FROM retention_policies WHERE code=? AND active=1 LIMIT 1`).bind(purposeRow.default_retention_policy_code).first();
  if(!retention) throw governanceError('FILE_RETENTION_POLICY_NOT_CONFIGURED',503);
  const access = await env.DB.prepare(`SELECT * FROM file_access_policies WHERE code=? AND active=1 LIMIT 1`).bind(purposeRow.access_policy_code).first();
  if(!access) throw governanceError('FILE_ACCESS_POLICY_NOT_CONFIGURED',503);
  return Object.freeze({
    version: FILE_GOVERNANCE_VERSION,
    classification: requested,
    purposeCode: purpose,
    processingPurposeCode: purposeRow.processing_purpose_code,
    evidenceType: evidence,
    accessPolicyCode: purposeRow.access_policy_code,
    accessPolicy: access,
    retentionPolicyCode: retention.code,
    retentionDays: retention.retention_days===null||retention.retention_days===undefined?null:Number(retention.retention_days),
    retentionAction: retention.action_after_expiry,
    legalHoldAllowed: Number(retention.legal_hold_allowed)===1,
    retentionVersion: String(retention.version||'1'),
    jurisdictionCode: String(jurisdictionCode)
  });
}

export async function prepareMissionFileRecord(env, session, { missionId, file, tenantId, purposeCode='MISSION_EXECUTION', classification=null, evidenceType='attachment', r2Key, contentSha256 }) {
  const access = await resolveMissionAccess(env,session,Number(missionId));
  if(!access) throw governanceError('MISSION_FILE_ACCESS_DENIED',403);
  const ownerCompanyId = Number(access.mission?.company_id || tenantId || access.tenantId || 0);
  if(!ownerCompanyId) throw governanceError('FILE_CONTROLLER_UNAVAILABLE',409);
  const countryCode=String(session?.countryCode||session?.country_code||'').trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(countryCode)||countryCode==='ZZ') throw governanceError('FILE_COUNTRY_UNRESOLVED',409);
  const compliance = await resolveCanonicalComplianceContext(env,session,{countryCode,purposeCode:purposeCode==='EVIDENCE'?'evidence':'mission_execution'});
  const jurisdictionCode = compliance?.jurisdiction?.code || null;
  const policy = await resolveFilePolicy(env,{purposeCode,classification,evidenceType,jurisdictionCode});
  if(!jurisdictionCode) throw governanceError('FILE_JURISDICTION_UNRESOLVED',409);
  assertDataPlanePolicy(env,compliance.jurisdiction.code);
  const due = retentionDueAt(policy.retentionDays);
  return {
    tenantId:Number(tenantId||ownerCompanyId),
    missionId:Number(missionId),
    role:String(session.role||''),
    driverId:session.role==='driver'?Number(session.driverId):null,
    mimeType:String(file?.type||'application/octet-stream'),
    originalName:String(file?.name||'file').slice(0,255),
    r2Key,
    fileSize:Number(file?.size||0),
    classification:policy.classification,
    purposeCode:policy.purposeCode,
    evidenceType:policy.evidenceType,
    controllerCompanyId:ownerCompanyId,
    countryCode,
    ownerType:'company',
    ownerId:ownerCompanyId,
    createdByIdentityType:createdIdentityType(session),
    createdByIdentityId:createdIdentityId(session),
    accessPolicyCode:policy.accessPolicyCode,
    retentionPolicyCode:policy.retentionPolicyCode,
    retentionPolicyVersion:policy.retentionVersion,
    retentionDueAt:due,
    contentSha256:String(contentSha256||''),
    integrityVersion:'1',
    governance:policy
  };
}

export async function authorizeFileAccess(env, session, file) {
  if(!file || String(file.disposition_status||'active')==='disposed') return denied('FILE_DISPOSED');
  const missionId=Number(file.mission_id||0);
  if(!missionId) return denied('FILE_MISSION_UNAVAILABLE');
  const access=await resolveMissionAccess(env,session,missionId);
  if(!access) return denied('MISSION_ACCESS_DENIED');
  const policy=await canonicalFirst(env,`SELECT * FROM file_access_policies WHERE code=? AND active=1 LIMIT 1`,[String(file.access_policy_code||'MISSION_PARTICIPANT')],'file_governance');
  if(!policy) return denied('FILE_ACCESS_POLICY_NOT_CONFIGURED');
  const accessKind=String(access.accessKind||'');
  if(['foryou-discovery','pending-foryou'].includes(accessKind)) return denied('MISSION_RELATIONSHIP_NOT_APPROVED');
  const viewerCompany=Number(access.tenantId||session?.tenantId||0);
  const ownerCompany=Number(file.controller_company_id||file.company_id||0);
  const isOwner=viewerCompany>0 && viewerCompany===ownerCompany;
  const assignedExecutor=(session.role==='executor' && Number(access.mission?.executor_id||access.mission?.owner_driver_id||0)===Number(session.executorId||session.driverId||0));
  const missionParticipant=Boolean(access.mission);
  const allowed=isOwner || (Number(policy.allow_shared_participant)===1&&missionParticipant) || (Number(policy.allow_assigned_executor)===1&&assignedExecutor);
  if(!allowed)return denied('FILE_RELATIONSHIP_NOT_AUTHORIZED');
  return {allowed:true,relationship:isOwner?'owner':assignedExecutor?'assigned_executor':'mission_participant',accessKind,policyCode:policy.code,classification:String(file.classification||'CONFIDENTIAL'),purposeCode:String(file.purpose_code||'MISSION_EXECUTION'),evidenceType:String(file.evidence_type||'attachment'),retentionPolicyCode:String(file.retention_policy_code||''),dispositionStatus:String(file.disposition_status||'active')};
}

export async function disposeFileByPolicy(env,session,fileId,{reason='policy_disposition',force=false}={}) {
  const file=await env.DB.prepare(`SELECT * FROM mission_files WHERE id=? LIMIT 1`).bind(Number(fileId)).first();
  if(!file) throw governanceError('FILE_NOT_FOUND',404);
  if(session?.role!=='admin' || Number(session.tenantId)!==Number(file.controller_company_id||file.company_id)) throw governanceError('FILE_DISPOSITION_ADMIN_REQUIRED',403);
  const policy=await env.DB.prepare(`SELECT retention_days,action_after_expiry,legal_hold_allowed,version FROM retention_policies WHERE code=? AND active=1 LIMIT 1`).bind(String(file.retention_policy_code||'')).first();
  if(!policy) throw governanceError('FILE_RETENTION_POLICY_NOT_CONFIGURED',503);
  const hold=await canonicalFirst(env,`SELECT id FROM privacy_legal_holds WHERE active=1 AND ((scope_type='file' AND scope_id=?) OR (scope_type='evidence' AND scope_id=?) OR (scope_type='mission' AND scope_id=? AND company_id=?)) LIMIT 1`,[Number(fileId),Number(fileId),Number(file.mission_id),Number(file.company_id)],'file_governance');
  const due=String(file.retention_due_at||'');
  const expired=Boolean(due && Date.parse(due)<=Date.now());
  if(hold && !force) {
    await markDisposition(env,file,'restricted','legal_hold_active',true);
    return {status:'restricted',reason:'legal_hold_active',fileId:Number(fileId),retained:true};
  }
  if(!force && !expired && String(policy.action_after_expiry)!=='delete') {
    await markDisposition(env,file,'pending_review','retention_review_required');
    return {status:'pending_review',reason:'retention_review_required',fileId:Number(fileId),retained:true};
  }
  const eventId=await prepareCriticalAudit(env,{session,action:'file.disposition',resourceType:'file',resourceId:Number(fileId),metadata:{reason,force,retentionAction:policy.action_after_expiry,legalHold:Boolean(hold)}});
  try {
    await env.DB.prepare(`UPDATE mission_files SET disposition_status='disposed',disposition_reason=?,disposed_at=CURRENT_TIMESTAMP WHERE id=? AND disposition_status<>'disposed'`).bind(String(reason).slice(0,500),Number(fileId)).run();
    if(file.r2_key && env.FILES){ await resolveExternalProviderGovernance(env,{providerCode:'r2_primary',companyId:Number(file.controller_company_id||file.tenant_id||0)||null,countryCode:String(file.country_code||'').toUpperCase(),purposeCode:'mission_execution',classification:String(file.classification||'CONFIDENTIAL'),dataFields:['file_bytes','content_type','mission_id','company_id','evidence_type','integrity_hash'],authorizationScope:'mission_file_storage',authorizationGranted:true,operation:'file_disposition'}); await env.FILES.delete(String(file.r2_key)); }
    await completeCriticalAudit(env,eventId,{success:true});
    await audit(env,{session:{...session,tenantId:Number(file.controller_company_id||file.company_id)},action:'file.disposition',resourceType:'file',resourceId:Number(fileId),metadata:{reason,force}}).catch(error=>{throw authorityUnavailable('file_disposition_audit',error);});
    return {status:'disposed',fileId:Number(fileId),retained:false};
  } catch(error) {
    await completeCriticalAudit(env,eventId,{success:false,errorCode:error?.code||error?.message||'FILE_DISPOSITION_FAILED'});
    throw error;
  }
}

function retentionDueAt(days){
  if(days===null||days===undefined)return null;
  const d=new Date(Date.now()+Number(days)*86400000);
  return d.toISOString();
}
function createdIdentityType(session){if(session?.role==='executor')return 'executor';if(session?.role==='driver')return 'driver';if(session?.role==='admin')return 'tenant';return null;}
function createdIdentityId(session){return session?.role==='executor'?Number(session.executorId||session.identityId||0)||null:session?.role==='driver'?Number(session.driverId||0)||null:session?.role==='admin'?Number(session.identityId||session.tenantId||0)||null:null;}
function denied(reason){return {allowed:false,reason};}
function governanceError(message,status=409){const e=new Error(message);e.status=status;return e;}
async function markDisposition(env,file,status,reason,legalHold=false){await env.DB.prepare(`UPDATE mission_files SET disposition_status=?,disposition_reason=?,legal_hold_active=? WHERE id=?`).bind(status,reason,legalHold?1:0,Number(file.id)).run();}
