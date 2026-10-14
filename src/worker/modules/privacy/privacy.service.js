import {getAccount} from '../account/account.service.js';
import {audit} from '../../security/audit.js';
import {resolveCanonicalCompanyContext} from '../../security/company-context.service.js';
import {getConsentOverview} from './consent.service.js';
import {canonicalFirst,canonicalAll} from '../../core/canonical-db.js';

const REQUEST_TYPES=new Set(['access','rectification','erasure','restriction','export','objection','consent_withdrawal']);

export async function getPrivacyStatus(env,session){
  const account=await getAccount(env,session);
  const requests=await listPrivacyRequests(env,session);
  const companyContext=await resolveCanonicalCompanyContext(env,Number(session?.tenantId||0));
  const consents=await getConsentOverview(env,session);
  return {
    policyVersion:'current',
    accountType:account.accountType,
    companyContext:companyContext?{companyId:companyContext.companyId,legalName:companyContext.identity.legalName,countryCode:companyContext.jurisdiction.countryCode,sectorCode:companyContext.organization.sectorCode,complianceStatus:companyContext.compliance.status,policyVersion:companyContext.compliance.policyVersion}:null,
    consent:consents,
    dataExportAvailable:true,
    accountDeletionAvailable:session.role!=='driver',
    rights:['access','rectification','erasure','restriction','export','objection','consent_withdrawal'],
    auditRetentionDays:retentionDays(env),
    telemetryRetentionDays:90,
    openRequests:requests.filter(r=>['received','processing','restricted'].includes(r.status)).length,
    securityNotes:['Authentication secrets are not included in exports.','Security and lifecycle evidence remains authoritative in protected event records.','Erasure is policy-aware and does not blindly destroy historical operational Truth.']
  };
}

export async function requestPrivacyRight(env,session,{requestType,reason=''}){
  const type=String(requestType||'').trim().toLowerCase();
  if(!REQUEST_TYPES.has(type))throw bad('Unsupported privacy request type');
  if(type==='erasure')throw bad('Use the account deletion flow for erasure requests');
  if(type==='export')return {requestType:'export',handledBy:'/api/account/privacy/export'};
  const identityType=session?.role==='executor'?'executor':session?.role==='driver'?'driver':'tenant';
  const identityId=identityType==='executor'?Number(session.executorId):identityType==='driver'?Number(session.driverId):Number(session.tenantId);
  const companyId=identityType==='tenant'||identityType==='driver'?Number(session.tenantId):null;
  const existing=await canonicalFirst(env,`SELECT id,status FROM privacy_requests WHERE identity_type=? AND identity_id=? AND request_type=? AND status IN ('received','processing','restricted') ORDER BY id DESC LIMIT 1`,[identityType,identityId,type],'privacy.open_request');
  if(existing)throw conflict('A matching privacy request is already open');
  const result=await env.DB.prepare(`INSERT INTO privacy_requests(company_id,identity_type,identity_id,request_type,status,reason,policy_version) VALUES(?,?,?,?, 'received', ?, 'current')`).bind(companyId,identityType,identityId,type,String(reason||'').slice(0,1000)).run();
  const id=Number(result.meta.last_row_id);
  await audit(env,{session:{...session,tenantId:companyId||0},action:`privacy.${type}.requested`,resourceType:'privacy_request',resourceId:id});
  return {id,requestType:type,status:'received'};
}

export async function listPrivacyRequests(env,session){
  const identityType=session?.role==='executor'?'executor':session?.role==='driver'?'driver':'tenant';
  const identityId=identityType==='executor'?Number(session.executorId):identityType==='driver'?Number(session.driverId):Number(session.tenantId);
  const rows=await canonicalAll(env,`SELECT id,request_type,status,policy_version,requested_at,due_at,completed_at,outcome_code,outcome_note FROM privacy_requests WHERE identity_type=? AND identity_id=? ORDER BY id DESC LIMIT 50`,[identityType,identityId],'privacy.request_history');
  return (rows.results||[]).map(r=>({id:Number(r.id),requestType:r.request_type,status:r.status,policyVersion:r.policy_version,requestedAt:r.requested_at,dueAt:r.due_at,completedAt:r.completed_at,outcomeCode:r.outcome_code||null,outcomeNote:r.outcome_note||null}));
}

export async function exportPersonalData(env,session){
  const account=await getAccount(env,session);
  const out={exportVersion:'current',generatedAt:new Date().toISOString(),account:{...account}};
  delete out.account.password;
  delete out.account.passwordHash;
  delete out.account.password_hash;

  if(session.role==='executor'){
    const checks=await canonicalAll(env,`SELECT check_type,status,updated_at FROM verification_checks WHERE profile_id=(SELECT id FROM verification_profiles WHERE identity_type='executor' AND identity_id=? LIMIT 1) ORDER BY check_type`,[Number(session.executorId)],'privacy.verification_checks');
    out.verification={checks:(checks.results||[]).map(r=>({type:r.check_type,status:r.status,method:r.method,updatedAt:r.updated_at}))};
  }else{
    const identityId=Number(session.identityId);
    const identity=await canonicalFirst(env,`SELECT id,role,display_name,login,email,driver_id,created_at,updated_at,last_login_at FROM auth_identities WHERE id=? AND company_id=? LIMIT 1`,[identityId,Number(session.tenantId)],'privacy.identity');
    out.identity=identity?{id:Number(identity.id),role:identity.role,displayName:identity.display_name,login:identity.login,email:identity.email,driverId:identity.driver_id?Number(identity.driver_id):null,createdAt:identity.created_at,updatedAt:identity.updated_at,lastLoginAt:identity.last_login_at}:null;
    if(session.role==='driver'&&session.driverId){
      const driver=await canonicalFirst(env,`SELECT id,name,created_at,removed_at,active FROM drivers WHERE id=? AND company_id=? LIMIT 1`,[Number(session.driverId),Number(session.tenantId)],'privacy.driver');
      out.driver=driver||null;
    }
  }
  return out;
}

export async function purgeExpiredOperationalData(env){
  const auditDays=retentionDays(env);
  const results={auditDeleted:0,telemetryDeleted:0,privacyRequestsDeleted:0};
  try{
    const r=await env.DB.prepare(`DELETE FROM audit_logs WHERE created_at < datetime('now', ? || ' days')`).bind(`-${auditDays}`).run();
    results.auditDeleted=Number(r?.meta?.changes||0);
  }catch(error){ if(!/no such table/i.test(String(error?.message||'')))throw error; }
  try{
    const r=await env.DB.prepare(`DELETE FROM action_execution_telemetry WHERE expires_at <= CURRENT_TIMESTAMP`).run();
    results.telemetryDeleted=Number(r?.meta?.changes||0);
  }catch(error){ if(!/no such table/i.test(String(error?.message||'')))throw error; }
  try{
    const r=await env.DB.prepare(`DELETE FROM privacy_requests WHERE completed_at IS NOT NULL AND completed_at < datetime('now','-1095 days')`).run();
    results.privacyRequestsDeleted=Number(r?.meta?.changes||0);
  }catch(error){ if(!/no such table/i.test(String(error?.message||'')))throw error; }
  return results;
}

function retentionDays(env){const n=Number(env?.AUDIT_RETENTION_DAYS||365);return Number.isInteger(n)&&n>=30&&n<=3650?n:365;}
const bad=m=>make(m,400),conflict=m=>make(m,409);function make(m,s){const e=new Error(m);e.status=s;return e;}
