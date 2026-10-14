import {canonicalFirst} from '../../core/canonical-db.js';
import {RELEASE_VERSION} from '../../core/release.js';
import { authorityUnavailable } from '../../core/canonical-db.js';
/**
 * ON Mission 10.35.5 — Canonical Consent Administration & Enforcement.
 *
 * Admin configuration is the policy authority. Runtime consent state is
 * resolved through canonical Company Context. This module does not determine
 * whether consent is legally required; it enforces an explicitly configured
 * consent gate when policy says it is required.
 */
import { resolveCanonicalCompanyContext } from '../../security/company-context.service.js';
import { audit } from '../../security/audit.js';

export const CONSENT_GOVERNANCE_VERSION=RELEASE_VERSION;
const ACTIONS = new Set(['grant','withdraw']);

function err(message,status=400){const e=new Error(message);e.status=status;return e;}
function clean(v,max=5000){return String(v??'').trim().slice(0,max);}

export async function resolveConsentPolicy(env,session,purposeCode){
  const purpose=clean(purposeCode,120);
  if(!purpose)throw err('Consent purpose is required');
  const context=await resolveCanonicalCompanyContext(env,Number(session?.tenantId||0));
  const country=String(context?.jurisdiction?.countryCode||session?.countryCode||'').trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(country)||country==='ZZ')throw err('CONSENT_COUNTRY_UNRESOLVED',409);
  const companyId=Number(context?.companyId||session?.tenantId||0)||null;
  const rows=(await env.DB.prepare(`
    SELECT cp.*,p.label purpose_label,p.description purpose_description,p.default_legal_basis
    FROM consent_policy_versions cp
    JOIN processing_purposes p ON p.code=cp.purpose_code
    WHERE cp.purpose_code=? AND cp.active=1
      AND (cp.company_id=? OR cp.company_id IS NULL)
      AND (cp.country_code=? OR cp.country_code='ZZ')
    ORDER BY CASE WHEN cp.company_id=? AND cp.country_code=? THEN 0
                  WHEN cp.company_id=? AND cp.country_code='ZZ' THEN 1
                  WHEN cp.company_id IS NULL AND cp.country_code=? THEN 2
                  ELSE 3 END,
             cp.effective_at DESC,cp.id DESC
    LIMIT 1`).bind(purpose,companyId,country,companyId,country,companyId,country).all()).results||[];
  const policy=rows[0]||null;
  if(!policy)throw err('CONSENT_POLICY_NOT_CONFIGURED',503);
  return Object.freeze({
    version:CONSENT_GOVERNANCE_VERSION,
    policyId:Number(policy.id),
    policyVersion:String(policy.policy_version),
    title:String(policy.title),
    policyText:String(policy.policy_text),
    purposeCode:String(policy.purpose_code),
    purposeLabel:String(policy.purpose_label||purpose),
    legalBasis:String(policy.default_legal_basis||'configured'),
    requireConsent:Number(policy.require_consent)===1,
    withdrawalEffect:String(policy.withdrawal_effect||'none'),
    countryCode:country,
    companyId,
    scopeCompanyId:policy.company_id===null?null:Number(policy.company_id),
    scopeCountry:String(policy.country_code||'ZZ')
  });
}

export async function getConsentState(env,session,purposeCode){
  const policy=await resolveConsentPolicy(env,session,purposeCode);
  const identity=identityOf(session);
  const record=await canonicalFirst(env,`
    SELECT id,granted,policy_version,granted_at,withdrawn_at
    FROM consent_records
    WHERE company_id=? AND identity_type=? AND identity_id=? AND purpose_code=?
    ORDER BY id DESC LIMIT 1`,[Number(session?.tenantId||0),identity.type,identity.id,policy.purposeCode],'consent_record_authority');
  const granted=Boolean(record && Number(record.granted)===1 && !record.withdrawn_at);
  return Object.freeze({policy,consent:{granted,recordId:record?Number(record.id):null,policyVersion:record?.policy_version||null,grantedAt:record?.granted_at||null,withdrawnAt:record?.withdrawn_at||null},decision:policy.requireConsent?(granted?'ALLOW':'CONSENT_REQUIRED'):'ALLOW'});
}

export async function assertConsentForPurpose(env,session,purposeCode){
  const state=await getConsentState(env,session,purposeCode);
  if(state.policy.requireConsent&&!state.consent.granted){
    const e=err('CONSENT_REQUIRED',403);e.code='CONSENT_REQUIRED';e.consent=state;throw e;
  }
  return state;
}

export async function recordConsent(env,session,{purposeCode,action,requestId=null}){
  const normalized=clean(action,20).toLowerCase();
  if(!ACTIONS.has(normalized))throw err('Unsupported consent action');
  const state=await getConsentState(env,session,purposeCode);
  const identity=identityOf(session);
  const companyId=Number(session?.tenantId||0);
  if(!companyId)throw err('Company context is required for consent',409);
  if(normalized==='grant'){
    await env.DB.prepare(`UPDATE consent_records SET granted=0,withdrawn_at=COALESCE(withdrawn_at,CURRENT_TIMESTAMP) WHERE company_id=? AND identity_type=? AND identity_id=? AND purpose_code=? AND granted=1 AND withdrawn_at IS NULL`).bind(companyId,identity.type,identity.id,state.policy.purposeCode).run();
    const result=await env.DB.prepare(`INSERT INTO consent_records(company_id,identity_type,identity_id,purpose_code,policy_version,granted,granted_at,withdrawn_at) VALUES(?,?,?,?,?,1,CURRENT_TIMESTAMP,NULL)`).bind(companyId,identity.type,identity.id,state.policy.purposeCode,state.policy.policyVersion).run();
    const id=Number(result.meta.last_row_id);
    await audit(env,{session:{...session,tenantId:companyId},action:'privacy.consent.granted',resourceType:'consent_record',resourceId:id,metadata:{purposeCode:state.policy.purposeCode,policyVersion:state.policy.policyVersion,requestId}}).catch(error=>{throw authorityUnavailable('privacy_consent_audit',error);});
    return getConsentState(env,session,state.policy.purposeCode);
  }
  await env.DB.prepare(`UPDATE consent_records SET granted=0,withdrawn_at=CURRENT_TIMESTAMP WHERE company_id=? AND identity_type=? AND identity_id=? AND purpose_code=? AND granted=1 AND withdrawn_at IS NULL`).bind(companyId,identity.type,identity.id,state.policy.purposeCode).run();
  await audit(env,{session:{...session,tenantId:companyId},action:'privacy.consent.withdrawn',resourceType:'consent_policy',resourceId:state.policy.policyId,metadata:{purposeCode:state.policy.purposeCode,policyVersion:state.policy.policyVersion,requestId}}).catch(error=>{throw authorityUnavailable('privacy_consent_audit',error);});
  return getConsentState(env,session,state.policy.purposeCode);
}

export async function getConsentOverview(env,session){
  const purposes=(await env.DB.prepare(`SELECT code,label,description,default_legal_basis FROM processing_purposes WHERE active=1 ORDER BY code`).all()).results||[];
  const items=[];
  for(const p of purposes)items.push(await getConsentState(env,session,p.code));
  return items.filter(Boolean);
}

function identityOf(session){
  if(session?.role==='executor')return {type:'executor',id:Number(session.executorId||session.identityId||0)};
  if(session?.role==='driver')return {type:'driver',id:Number(session.driverId||0)};
  return {type:'tenant',id:Number(session.identityId||session.tenantId||0)};
}
